import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, questionsTable, answersTable, walletsTable, transactionsTable, usersTable, questionMilestonesTable } from "@workspace/db";
import { eq, count, desc, asc, and, sql, inArray, notInArray, gte, lt, ilike, ne, or, isNull } from "drizzle-orm";
import { VALID_CATEGORIES } from "@workspace/api-zod";
import { detectLang } from "../lib/langDetect.js";
import { translateQuestion } from "../lib/translate.js";
import { checkUserBan, checkIpBan, BAN_MESSAGE, IP_BAN_MESSAGE } from "../lib/banCheck.js";
import { getClientIp } from "../lib/clientIp.js";

const router: IRouter = Router();

// ── Shared feed cache (user-agnostic) ─────────────────────────────────────────
//
// Design goals:
//   1. All users share the same cache entries — no per-user keys.
//   2. ONLY base question data is stored — NO isAnswered, NO user-specific fields.
//   3. isAnswered is annotated in memory after every cache hit (indexed lookup).
//   4. Cache key = query filters only (category, type, status, paging, order, search).
//   5. Requests with excludeAnswered=true or onlyAnswered=true BYPASS the shared cache
//      because they change which rows appear (WHERE clause), not just a field value.
//
// Feed ordering — 3-tier ranking (see buildRankExpr):
//   Group 1: ALL questions with < 10 answers (fresh)  — top
//   Group 2: non-fresh admin / editor / system seeds  — middle
//   Group 3: non-fresh normal-user questions (< $5 creators; ≥ $5 filtered out by WHERE)
//   Within each group: created_at DESC
//
// TTL: 45 s — a new question appears within 45 s of approval.
// Max slots: 200 — prevents unbounded growth under many unique filter combos.

const FEED_CACHE_TTL_MS = 45_000;
const FEED_CACHE_MAX_SLOTS = 200;

// ── Privileged-creator ID cache (admin + editor users) — 5 min TTL ─────────
// Used to build the GROUP 2 condition in the 3-tier feed ranking without a JOIN.
// The set is tiny (typically 2-10 IDs), so storing it in memory is free.
const PRIVILEGED_CACHE_TTL_MS = 5 * 60_000;
let privilegedCreatorsCache: { ids: string[]; expires: number } | null = null;

// ── Suppressed-creator IDs cache (normal users with totalEarned >= 500¢) — 5 min TTL ──
// Goal 1 visibility rule: questions by these creators are hidden from normal feed listings.
// Admin/editor creators are NEVER added to this list.
const SUPPRESSED_CACHE_TTL_MS = 5 * 60_000;
let suppressedCreatorsCache: { ids: string[]; expires: number } | null = null;

// ── Categories cache (completely static data — changes only when questions are added/approved) ──
const CATEGORIES_CACHE_TTL_MS = 10 * 60_000; // 10 min
let categoriesCache: { data: any; expires: number } | null = null;

// ── Profile questions cache (per-user, 30 s TTL) ───────────────────────────────
// Keyed by userId so each user's answered state is correct.
// When a user answers a profile question, invalidate their cache entry.
const PROFILE_CACHE_TTL_MS = 30_000;
const PROFILE_CACHE_MAX_SLOTS = 5000;
const profileCache = new Map<string, { data: any; expires: number }>();
export function invalidateProfileCache(userId: string): void {
  profileCache.delete(userId);
}
function profileCacheGet(userId: string): any | null {
  const e = profileCache.get(userId);
  if (!e || Date.now() > e.expires) { profileCache.delete(userId); return null; }
  return e.data;
}
function profileCacheSet(userId: string, data: any): void {
  if (profileCache.size >= PROFILE_CACHE_MAX_SLOTS) profileCache.delete(profileCache.keys().next().value!);
  profileCache.set(userId, { data, expires: Date.now() + PROFILE_CACHE_TTL_MS });
}

const feedCache = new Map<string, { data: { questions: any[]; total: number }; expires: number }>();

/** Cache key — NO userId, NO excludeAnswered/onlyAnswered (those bypass cache). */
function buildSharedCacheKey(p: Record<string, string>): string {
  return JSON.stringify({
    category: p.category ?? "",
    type:     p.type     ?? "",
    status:   p.status   ?? "active",
    limit:    p.limit    ?? "20",
    offset:   p.offset   ?? "0",
    order:    p.order    ?? "",
    search:   p.search   ?? "",
    lang:     p.lang     ?? "",
  });
}

function feedCacheGet(key: string): { questions: any[]; total: number } | null {
  const entry = feedCache.get(key);
  if (!entry || Date.now() > entry.expires) {
    feedCache.delete(key);
    return null;
  }
  return entry.data;
}

function feedCacheSet(key: string, data: { questions: any[]; total: number }): void {
  // Evict oldest slot when at capacity to prevent unbounded growth.
  if (feedCache.size >= FEED_CACHE_MAX_SLOTS) {
    feedCache.delete(feedCache.keys().next().value!);
  }
  feedCache.set(key, { data, expires: Date.now() + FEED_CACHE_TTL_MS });
}

/**
 * Returns clerk_ids of all admin and editor users from cache or DB.
 * Used to classify questions into Group 2 (privileged) in the 3-tier feed ranking.
 * TTL: 5 min — admin/editor assignments change rarely.
 */
async function getPrivilegedCreatorIds(): Promise<string[]> {
  if (privilegedCreatorsCache && Date.now() < privilegedCreatorsCache.expires) {
    return privilegedCreatorsCache.ids;
  }
  const rows = await db
    .select({ clerkId: usersTable.clerkId })
    .from(usersTable)
    .where(sql`${usersTable.isAdmin} = true OR ${usersTable.isEditor} = true`);
  const ids = rows.map(r => r.clerkId);
  privilegedCreatorsCache = { ids, expires: Date.now() + PRIVILEGED_CACHE_TTL_MS };
  return ids;
}

/**
 * Returns clerk_ids of normal users whose lifetime earnings have reached
 * 500¢ ($5.00). Their questions are hidden from normal feed/category listings.
 * Admin/editor users are always excluded from this list.
 * TTL: 5 min — sufficient resolution for this visibility rule.
 */
async function getSuppressedCreatorIds(): Promise<string[]> {
  if (suppressedCreatorsCache && Date.now() < suppressedCreatorsCache.expires) {
    return suppressedCreatorsCache.ids;
  }
  const rows = await db
    .select({ clerkId: usersTable.clerkId })
    .from(usersTable)
    .innerJoin(walletsTable, eq(usersTable.clerkId, walletsTable.userId))
    .where(and(
      eq(usersTable.isAdmin, false),
      eq(usersTable.isEditor, false),
      gte(walletsTable.totalEarnedCents, 500),
    ));
  const ids = rows.map(r => r.clerkId);
  suppressedCreatorsCache = { ids, expires: Date.now() + SUPPRESSED_CACHE_TTL_MS };
  return ids;
}

/**
 * Builds the 3-tier ranking CASE expression for the main feed.
 *
 *  Group 1 (rank 1) — Fresh questions: totalAnswers < 10, ANY creator type
 *                     → appears first; newest within group
 *
 *  Group 2 (rank 2) — Non-fresh privileged questions: admin / editor / system seed
 *                     → appears middle; newest within group
 *
 *  Group 3 (rank 3) — Non-fresh normal-user questions (creator < $5 earnings)
 *                     → appears last; newest within group
 *                     (≥ $5 creators are filtered out entirely by the suppression WHERE clause)
 *
 * CASE evaluates top-to-bottom, so freshness is checked first:
 * a brand-new admin question (0 answers) gets rank 1 alongside fresh normal-user questions.
 * An older admin question (≥ 10 answers) gets rank 2.
 *
 * No DB join needed: privilegedIds is already fetched and cached.
 */
function buildRankExpr(privilegedIds: string[]) {
  if (privilegedIds.length === 0) {
    // No admins/editors — distinguish only fresh vs. non-fresh + system seeds.
    return sql<number>`CASE
      WHEN ${questionsTable.totalAnswers} < 10 THEN 1
      WHEN ${questionsTable.creatorId} IS NULL THEN 2
      ELSE 3
    END`;
  }
  const idList = sql.join(privilegedIds.map(id => sql`${id}`), sql`, `);
  return sql<number>`CASE
    WHEN ${questionsTable.totalAnswers} < 10 THEN 1
    WHEN ${questionsTable.creatorId} IS NULL
      OR ${questionsTable.creatorId} = ANY(ARRAY[${idList}]::text[]) THEN 2
    ELSE 3
  END`;
}

router.get("/questions", async (req, res): Promise<void> => {
  const params = req.query as Record<string, string>;
  const {
    category, type, status = "active",
    limit = "20", offset = "0",
    excludeAnswered, onlyAnswered, order,
    search, lang,
  } = params;
  const lim = parseInt(limit, 10);
  const off = parseInt(offset, 10);
  const auth = getAuth(req);
  const userId = auth?.userId ?? null;

  // ── Fetch privilege + suppression caches upfront (both in-memory, near-zero cost) ──
  // Must happen before the cache check so we can determine per-viewer bypass conditions.
  const [privilegedIds, suppressedIds] = await Promise.all([
    getPrivilegedCreatorIds(),
    getSuppressedCreatorIds(),
  ]);
  // Admin/editor viewers see all questions — suppression rule does not apply to them.
  const isPrivilegedViewer = userId !== null && privilegedIds.includes(userId);
  // High-earner creator: they can still see their own questions even when suppressed for others.
  const isHighEarnerCreator = userId !== null && suppressedIds.includes(userId);

  // ── Shared cache strategy ─────────────────────────────────────────────────
  //
  // excludeAnswered / onlyAnswered change WHICH questions appear (WHERE clause),
  // so they cannot share a generic cache with normal browse requests.
  // Admin/editor viewers see unsuppressed results; high-earner creators see their own
  // questions — both need a different result set so they bypass the shared cache.
  const useSharedCache = excludeAnswered !== "true" && onlyAnswered !== "true"
    && !isPrivilegedViewer && !isHighEarnerCreator;
  const cacheKey = useSharedCache ? buildSharedCacheKey(params) : null;

  // ── Helper: annotate each question with the user's answered state ─────────
  // DB ordering is now authoritative (3-tier ranking — see buildRankExpr).
  // We only add the isAnswered flag here; we do NOT re-sort in memory because
  // that would scramble the group order that PostgreSQL already computed.
  async function applyUserContext(questions: any[]): Promise<any[]> {
    if (!userId || questions.length === 0) {
      return questions.map(q => ({ ...q, isAnswered: false }));
    }
    const questionIds = questions.map(q => q.id);
    const answeredRows = await db
      .select({ questionId: answersTable.questionId })
      .from(answersTable)
      .where(and(
        eq(answersTable.userId, userId),
        inArray(answersTable.questionId, questionIds),
      ));
    const answeredSet = new Set(answeredRows.map(r => r.questionId));
    return questions.map(q => ({ ...q, isAnswered: answeredSet.has(q.id) }));
  }

  // ── Cache hit path ────────────────────────────────────────────────────────
  if (cacheKey) {
    const cached = feedCacheGet(cacheKey);
    if (cached) {
      const questions = await applyUserContext(cached.questions);
      return void res.json({ questions, total: cached.total });
    }
  }

  // ── Cache miss: fetch from DB ─────────────────────────────────────────────
  // Base WHERE conditions (user-agnostic for the shared cache path).
  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(questionsTable.status, status));
  if (category) conditions.push(sql`${category} = ANY(COALESCE(${questionsTable.categories}, ARRAY[${questionsTable.category}]))` as any);
  if (type) conditions.push(eq(questionsTable.type, type));
  conditions.push(eq(questionsTable.isProfileQuestion, false));
  // Optional language filter — client sends ?lang=en to show only questions in that language.
  // Questions where lang IS NULL (pre-backfill) are always included so nothing is hidden.
  if (lang) conditions.push(sql`(${questionsTable.lang} = ${lang} OR ${questionsTable.lang} IS NULL)` as any);

  // ── Search mode ───────────────────────────────────────────────────────────
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(ilike(questionsTable.title, term) as any);
    const whereClause = and(...conditions);

    // Search: ordered by totalAnswers ASC then date — not the 3-tier ranking (search is a secondary view).
    const [fetchResult, [countRow]] = await Promise.all([
      db.select().from(questionsTable)
        .where(whereClause)
        .orderBy(asc(questionsTable.totalAnswers), desc(questionsTable.createdAt), desc(questionsTable.id))
        .limit(lim).offset(off),
      db.select({ total: count() }).from(questionsTable).where(whereClause),
    ]);

    const baseResult = { questions: fetchResult, total: Number(countRow.total) };
    if (cacheKey) feedCacheSet(cacheKey, baseResult);

    const questions = await applyUserContext(fetchResult);
    return void res.json({ questions, total: baseResult.total });
  }

  // ── Non-search mode ───────────────────────────────────────────────────────

  // excludeAnswered / onlyAnswered require userAnsweredIds in the WHERE clause.
  // These requests bypass the shared cache so we need to fetch answered IDs now.
  let bypassAnsweredIds: number[] = [];
  if (!useSharedCache && userId) {
    const rows = await db
      .select({ questionId: answersTable.questionId })
      .from(answersTable)
      .where(eq(answersTable.userId, userId));
    bypassAnsweredIds = rows.map(r => r.questionId);
  }

  if (excludeAnswered === "true" && bypassAnsweredIds.length > 0) {
    conditions.push(notInArray(questionsTable.id, bypassAnsweredIds));
  }
  if (onlyAnswered === "true") {
    if (bypassAnsweredIds.length > 0) {
      conditions.push(inArray(questionsTable.id, bypassAnsweredIds));
    } else {
      conditions.push(eq(questionsTable.id, -1)); // user answered nothing → empty
    }
  }

  // ── Goal 1: Feed visibility rule — hide non-fresh questions from high-earner creators ──
  // Applied to non-search feed/list/category listings only. Search is untouched.
  // Admin/editor viewers see everything. Creators see their own questions.
  // NULL creator_id = admin-seeded question → always visible.
  //
  // Suppression condition (all three must hold to hide a question):
  //   1. creator is a normal user (not admin/editor)
  //   2. creator's totalEarned >= 500¢ ($5)
  //   3. question totalAnswers >= 10 (no longer fresh)
  //
  // Fresh questions (totalAnswers < 10) from ANY creator — including high-earner
  // normal users — always pass through and appear in Group 1 of the feed.
  if (suppressedIds.length > 0 && !isPrivilegedViewer) {
    const idsToHide = isHighEarnerCreator && userId
      ? suppressedIds.filter(id => id !== userId) // creator sees own, not other high-earners'
      : suppressedIds;                            // normal viewer: hide all high-earner creators
    if (idsToHide.length > 0) {
      // Include the question if ANY of:
      //   a) creatorId IS NULL (admin seed — never suppressed)
      //   b) creator is not in the suppressed list
      //   c) question is still fresh (totalAnswers < 10) — suppression has not kicked in yet
      conditions.push(or(
        isNull(questionsTable.creatorId),
        notInArray(questionsTable.creatorId, idsToHide),
        lt(questionsTable.totalAnswers, 10),
      ) as any);
    }
  }

  const whereClause = and(...conditions);
  const query = db.select().from(questionsTable).$dynamic().where(whereClause);

  // createdAt tiebreak respects ?order=asc (admin tooling) but defaults to DESC.
  const orderDir   = order === "asc" ? asc(questionsTable.createdAt) : desc(questionsTable.createdAt);
  const idTiebreak = order === "asc" ? asc(questionsTable.id)        : desc(questionsTable.id);

  // ── 3-tier feed ranking ──────────────────────────────────────────────────
  // privilegedIds already fetched at the top of this handler (before cache check).
  const rankExpr = buildRankExpr(privilegedIds);

  const countQuery = db.select({ total: count() }).from(questionsTable).where(whereClause);

  const [rows, [countRow]] = await Promise.all([
    query.orderBy(rankExpr, orderDir, idTiebreak).limit(lim).offset(off),
    countQuery,
  ]);
  const fetchResult = rows;
  const total = Number(countRow.total);

  // Store base data (no isAnswered) in shared cache.
  const baseResult = { questions: fetchResult, total };
  if (cacheKey) feedCacheSet(cacheKey, baseResult);

  // Resolve isAnswered in memory for this user.
  const questions = await applyUserContext(fetchResult);
  res.json({ questions, total });
});

router.get("/questions/featured", async (_req, res): Promise<void> => {
  const questions = await db.select().from(questionsTable)
    .where(and(
      eq(questionsTable.status, "active"),
      eq(questionsTable.isProfileQuestion, false),
      eq(questionsTable.isFeatured, true),
    ))
    .orderBy(asc(questionsTable.featuredPosition))
    .limit(6);
  res.json({ questions, total: questions.length });
});

router.get("/questions/categories", async (_req, res): Promise<void> => {
  // 10-minute shared cache — category counts change only when questions are approved/added.
  if (categoriesCache && Date.now() <= categoriesCache.expires) {
    return void res.json(categoriesCache.data);
  }

  // Unnest the multi-category array so each category gets counted once per question.
  // Falls back to the legacy `category` column for rows where the array is NULL.
  const results = await db.execute(sql`
    SELECT cat AS category, COUNT(*)::int AS cnt
    FROM questions,
         UNNEST(COALESCE(categories, ARRAY[category])) AS t(cat)
    WHERE status = 'active'
      AND is_profile_question = false
    GROUP BY cat
  `);
  const allRows: any[] = Array.isArray(results) ? results : (results as any).rows ?? [];
  const validSet = new Set(VALID_CATEGORIES as readonly string[]);
  const rows = allRows.filter(r => validSet.has(r.category));

  const countMap: Record<string, number> = {};
  for (const r of rows) countMap[r.category] = Number(r.cnt);

  const total = Object.values(countMap).reduce((s, n) => s + n, 0);
  const categories = VALID_CATEGORIES.map(cat => ({
    category: cat,
    count: countMap[cat] ?? 0,
    percentage: total > 0 ? Math.round(((countMap[cat] ?? 0) / total) * 100) : 0,
  }));

  const payload = { categories };
  categoriesCache = { data: payload, expires: Date.now() + CATEGORIES_CACHE_TTL_MS };
  res.json(payload);
});

// GET /api/questions/profile — all active profile questions with user answer status
// Fixed N+1: poll + rating stats are batched into 2 queries regardless of question count.
// Per-user 30 s cache; invalidated when the user submits an answer.
router.get("/questions/profile", async (req, res): Promise<void> => {
  const auth = getAuth(req);

  // ── Cache hit path ──────────────────────────────────────────────────────────
  const cacheKey = auth?.userId ?? "__guest__";
  const cached = profileCacheGet(cacheKey);
  if (cached) return void res.json(cached);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const questions = await db.select()
    .from(questionsTable)
    .where(and(
      eq(questionsTable.isProfileQuestion, true),
      eq(questionsTable.status, "active"),
    ))
    .orderBy(asc(questionsTable.id));

  if (!auth?.userId || questions.length === 0) {
    const payload = {
      questions: questions.map(q => ({ ...q, userHasAnswered: false, userAnswer: null })),
      total: questions.length,
    };
    profileCacheSet(cacheKey, payload);
    return void res.json(payload);
  }

  const questionIds = questions.map(q => q.id);
  const answeredPollIds = questions.filter(q => q.type === "poll").map(q => q.id);
  const answeredRatingIds = questions.filter(q => q.type === "rating").map(q => q.id);

  // ── 3 parallel queries replace the old N+1 (1 query per answered question) ──
  const [userAnswers, allPollAnswers, allRatingStats] = await Promise.all([
    // (1) Which profile questions has this user answered?
    db.select()
      .from(answersTable)
      .where(and(
        eq(answersTable.userId, auth.userId),
        inArray(answersTable.questionId, questionIds),
        or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      )),

    // (2) All poll answer counts for ALL poll-type profile questions in one query
    answeredPollIds.length > 0
      ? db.select({
          questionId: answersTable.questionId,
          pollOption: answersTable.pollOption,
          cnt: count(),
        })
        .from(answersTable)
        .where(and(
          inArray(answersTable.questionId, answeredPollIds),
          or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
        ))
        .groupBy(answersTable.questionId, answersTable.pollOption)
      : Promise.resolve([] as { questionId: number; pollOption: string | null; cnt: number }[]),

    // (3) All rating stats for ALL rating-type profile questions in one query
    answeredRatingIds.length > 0
      ? db.select({
          questionId: answersTable.questionId,
          avg: sql<number>`AVG(${answersTable.rating}) FILTER (WHERE ${answersTable.notFamiliar} = false AND ${answersTable.rating} IS NOT NULL)`,
          ratingCnt: sql<number>`COUNT(*) FILTER (WHERE ${answersTable.notFamiliar} = false AND ${answersTable.rating} IS NOT NULL)`,
          notFamiliarCnt: sql<number>`COUNT(*) FILTER (WHERE ${answersTable.notFamiliar} = true)`,
        })
        .from(answersTable)
        .where(and(
          inArray(answersTable.questionId, answeredRatingIds),
          or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
        ))
        .groupBy(answersTable.questionId)
      : Promise.resolve([] as { questionId: number; avg: number; ratingCnt: number; notFamiliarCnt: number }[]),
  ]);

  // ── Join results in memory — no more per-question DB calls ─────────────────
  const answerMap = new Map(userAnswers.map(a => [a.questionId, a]));

  // Index poll answers by questionId → { option → count }
  const pollByQuestion = new Map<number, { option: string; cnt: number }[]>();
  for (const r of allPollAnswers) {
    if (!pollByQuestion.has(r.questionId)) pollByQuestion.set(r.questionId, []);
    pollByQuestion.get(r.questionId)!.push({ option: r.pollOption ?? "", cnt: Number(r.cnt) });
  }

  // Index rating stats by questionId
  const ratingByQuestion = new Map(allRatingStats.map(r => [r.questionId, r]));

  const enriched = questions.map(q => {
    const userAnswer = answerMap.get(q.id) ?? null;
    const userHasAnswered = answerMap.has(q.id);

    let pollResults: { option: string; count: number; percentage: number }[] | null = null;
    let ratingAverage: number | null = null;
    let notFamiliarCount = 0;
    let ratingCount = 0;

    if (userHasAnswered && q.type === "poll" && q.pollOptions) {
      const rows = pollByQuestion.get(q.id) ?? [];
      const totalVotes = rows.reduce((s, r) => s + r.cnt, 0);
      pollResults = q.pollOptions.map(opt => {
        const found = rows.find(r => r.option === opt);
        const cnt = found ? found.cnt : 0;
        return { option: opt, count: cnt, percentage: totalVotes > 0 ? Math.round((cnt / totalVotes) * 100) : 0 };
      });
    }

    if (userHasAnswered && q.type === "rating") {
      const r = ratingByQuestion.get(q.id);
      ratingAverage = r?.avg ? parseFloat(String(r.avg)) : null;
      ratingCount = r?.ratingCnt ? Number(r.ratingCnt) : 0;
      notFamiliarCount = r?.notFamiliarCnt ? Number(r.notFamiliarCnt) : 0;
    }

    return { ...q, userHasAnswered, userAnswer, pollResults, ratingAverage, notFamiliarCount, ratingCount };
  });

  const payload = { questions: enriched, total: enriched.length };
  profileCacheSet(cacheKey, payload);
  res.json(payload);
});

router.get("/questions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question || question.status === "hidden" || question.status === "archived_duplicate") {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const auth = getAuth(req);
  let userHasAnswered = false;
  let userAnswer: typeof answersTable.$inferSelect | null = null;
  if (auth?.userId) {
    const [existing] = await db.select().from(answersTable)
      .where(and(
        eq(answersTable.questionId, id),
        eq(answersTable.userId, auth.userId),
        or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      ));
    if (existing) {
      userHasAnswered = true;
      userAnswer = existing;
    }
  }

  let ratingAverage: number | null = null;
  let notFamiliarCount = 0;
  let ratingCount = 0;
  let pollResults: { option: string; count: number; percentage: number }[] | null = null;

  if (question.type === "rating") {
    const result = await db.select({
      avg: sql<number>`AVG(${answersTable.rating}) FILTER (WHERE ${answersTable.notFamiliar} = false AND ${answersTable.rating} IS NOT NULL)`,
      ratingCnt: sql<number>`COUNT(*) FILTER (WHERE ${answersTable.notFamiliar} = false AND ${answersTable.rating} IS NOT NULL)`,
      notFamiliarCnt: sql<number>`COUNT(*) FILTER (WHERE ${answersTable.notFamiliar} = true)`,
    }).from(answersTable).where(and(
      eq(answersTable.questionId, id),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
    ));
    ratingAverage = result[0]?.avg ? parseFloat(String(result[0].avg)) : null;
    ratingCount = result[0]?.ratingCnt ? Number(result[0].ratingCnt) : 0;
    notFamiliarCount = result[0]?.notFamiliarCnt ? Number(result[0].notFamiliarCnt) : 0;
  }

  if (question.type === "poll" && question.pollOptions) {
    const pollAnswers = await db.select({ pollOption: answersTable.pollOption, count: count() })
      .from(answersTable)
      .where(and(
        eq(answersTable.questionId, id),
        or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      ))
      .groupBy(answersTable.pollOption);

    const totalVotes = pollAnswers
      .filter(r => question.pollOptions!.includes(r.pollOption!))
      .reduce((sum, r) => sum + Number(r.count), 0);
    pollResults = question.pollOptions.map(opt => {
      const found = pollAnswers.find(a => a.pollOption === opt);
      const cnt = found ? Number(found.count) : 0;
      return {
        option: opt,
        count: cnt,
        percentage: totalVotes > 0 ? Math.round((cnt / totalVotes) * 100) : 0,
      };
    });
  }

  res.json({ ...question, ratingAverage, notFamiliarCount, ratingCount, pollResults, userHasAnswered, userAnswer });
});

router.post("/questions", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clientIp = getClientIp(req);

  // ── Ban checks ────────────────────────────────────────────────────────────
  const banStatus = await checkUserBan(auth.userId);
  if (banStatus.banned) {
    console.warn(`[ban] Blocked question creation by banned user ${auth.userId}`);
    res.status(403).json({ error: BAN_MESSAGE, code: "account_banned" });
    return;
  }
  if (await checkIpBan(clientIp)) {
    console.warn(`[ban] Blocked question creation from banned IP ${clientIp}`);
    res.status(403).json({ error: IP_BAN_MESSAGE, code: "ip_banned" });
    return;
  }

  const { title, description, type, pollOptions } = req.body;
  // Accept either `categories` (new, array) or legacy `category` (single string).
  const rawCategories: string[] = Array.isArray(req.body.categories)
    ? req.body.categories
    : req.body.category
      ? [req.body.category]
      : [];

  if (!title || !type || rawCategories.length === 0) {
    res.status(400).json({ error: "title, type, and at least one category are required" });
    return;
  }
  if (rawCategories.length > 3) {
    res.status(400).json({ error: "A question can belong to at most 3 categories" });
    return;
  }
  const invalidCat = rawCategories.find(c => !(VALID_CATEGORIES as readonly string[]).includes(c));
  if (invalidCat) {
    res.status(400).json({ error: `Invalid category: "${invalidCat}"` });
    return;
  }
  const primaryCategory = rawCategories[0];

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  const isAdmin = !!user?.isAdmin;
  const isEditor = !!user?.isEditor;
  // isPrivileged: bypasses all creation fees, cooldowns, and daily limits.
  // Admins and Editors are both privileged for question creation purposes.
  const isPrivileged = isAdmin || isEditor;

  // ── Cooldown check (non-privileged only) ───────────────────────────────────
  if (!isPrivileged && user?.lastQuestionAt) {
    const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
    const elapsed = Date.now() - new Date(user.lastQuestionAt).getTime();
    if (elapsed < COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      res.status(429).json({
        error: "Please wait before creating another question.",
        remainingSeconds,
      });
      return;
    }
  }

  // ── Hybrid daily creation limit (non-privileged only) ─────────────────────
  // Rejected questions are excluded from all counts.
  // Phase 1 (total approved+pending < 10): max 5 per 24 hours
  // Phase 2 (total approved+pending >= 10): max 2 per 24 hours
  if (!isPrivileged) {
    const COUNTED_STATUSES = ["active", "pending"] as const;
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // All-time count of non-rejected questions (determines which phase)
    const [{ totalCount }] = await db
      .select({ totalCount: count() })
      .from(questionsTable)
      .where(and(
        eq(questionsTable.creatorId, auth.userId),
        inArray(questionsTable.status, [...COUNTED_STATUSES]),
      ));

    const total = Number(totalCount);

    // Recent (last 24h) count of non-rejected questions
    const [{ recentCount }] = await db
      .select({ recentCount: count() })
      .from(questionsTable)
      .where(and(
        eq(questionsTable.creatorId, auth.userId),
        inArray(questionsTable.status, [...COUNTED_STATUSES]),
        gte(questionsTable.createdAt, since24h),
      ));

    const recent = Number(recentCount);

    if (total >= 10) {
      // Phase 2: 2 questions per 24 hours
      if (recent >= 2) {
        res.status(429).json({
          error: "You have reached your daily question limit of 2. Please try again after 24 hours.",
          code: "daily_question_limit_strict",
        });
        return;
      }
    } else {
      // Phase 1: 5 questions per 24 hours
      if (recent >= 5) {
        res.status(429).json({
          error: "You have reached your daily limit of 5 questions.",
          code: "daily_question_limit",
        });
        return;
      }
    }
  }

  // ── Fee deduction (ALL users — no bypass) ─────────────────────────────────
  // Every user, including admins and editors, pays 25¢ to submit a question.
  // Cooldowns and daily limits are still exempt for admins/editors (above),
  // but the economic cost applies universally.
  //
  // Race-safe: the UPDATE only fires if balance_cents >= 25 at the DB level.
  // Two concurrent question submissions from the same account both pass the
  // balance SELECT (read-then-write race), but only the first UPDATE succeeds;
  // the second sees balance_cents = 0 (below threshold) and returns 0 rows → 402.
  const QUESTION_SUBMISSION_COST = 25; // 20¢ refundable + 5¢ penalty on rejection
  const [deducted] = await db.update(walletsTable)
    .set({ balanceCents: sql`balance_cents - ${QUESTION_SUBMISSION_COST}` })
    .where(and(
      eq(walletsTable.userId, auth.userId),
      sql`balance_cents >= ${QUESTION_SUBMISSION_COST}`,
    ))
    .returning({ newBalance: walletsTable.balanceCents });

  if (!deducted) {
    res.status(402).json({ error: "Insufficient funds. Creating a question costs 25 cents." });
    return;
  }

  await db.insert(transactionsTable).values({
    userId: auth.userId,
    type: "question_creation",
    amountCents: -QUESTION_SUBMISSION_COST,
    description: `Question submission: "${title}"`,
    status: "completed",
  });

  // Detect language from title + description (fast, offline, no API call).
  const langText = [title, description].filter(Boolean).join(" ");
  const detectedLang = detectLang(langText);

  const [question] = await db.insert(questionsTable).values({
    title,
    description: description || null,
    type,
    category: primaryCategory,
    categories: rawCategories,
    // Admins get questions auto-approved; Editors questions go to pending
    // (Editors can approve their own questions via the moderation panel).
    status: isAdmin ? "active" : "pending",
    pollOptions: pollOptions && pollOptions.length > 0 ? pollOptions : null,
    creatorId: auth.userId,
    creatorName: user?.name || null,
    isCustom: true,
    lang: detectedLang === "und" ? null : detectedLang,
  }).returning();

  // ── Record timestamp for cooldown (non-privileged only) ────────────────────
  if (!isPrivileged) {
    await db.update(usersTable)
      .set({ lastQuestionAt: new Date() })
      .where(eq(usersTable.clerkId, auth.userId));
  }

  res.status(201).json(question);
});

// ── Bonus progress (creator only) — historical data only ──────────────────────
// The 50-answer milestone bonus is disabled going forward.
// This endpoint now returns only historical payout records; no new bonuses are awarded.
router.get("/questions/:id/bonus-progress", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid question id" }); return; }

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }
  if (question.creatorId !== auth.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [countRow] = await db
    .select({ cnt: sql<number>`COUNT(DISTINCT ${answersTable.userId})::int` })
    .from(answersTable)
    .where(
      and(
        eq(answersTable.questionId, id),
        sql`${answersTable.userId} != ${question.creatorId}`,
        or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      ),
    );
  const uniqueAnswerers = Number(countRow?.cnt ?? 0);

  const rewarded = await db
    .select()
    .from(questionMilestonesTable)
    .where(eq(questionMilestonesTable.questionId, id));
  const rewardedMilestones = rewarded.map(r => r.milestone);
  const totalRewardedCents = rewarded.reduce((s, r) => s + r.rewardCents, 0);

  res.json({
    uniqueAnswerers,
    nextMilestone: null,
    nextRewardCents: null,
    needed: 0,
    progressPercent: 100,
    rewardedMilestones,
    totalRewardedCents,
    bonusAlreadyPaid: true,
  });
});
// ── POST /questions/:id/translate ────────────────────────────────────────────
// On-demand translation via OpenAI. Does NOT store in DB — caching is the
// client's responsibility. Rate-limited by OpenAI; no per-user auth required
// (translations are public data — the original is already public).
router.post("/questions/:id/translate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const targetLang = (req.body?.targetLang as string | undefined)?.trim() || "en";
  if (!/^[a-z]{2,3}$/.test(targetLang)) {
    res.status(400).json({ error: "targetLang must be a 2-3 letter ISO 639-1 code" });
    return;
  }

  const [question] = await db
    .select({
      id: questionsTable.id,
      title: questionsTable.title,
      description: questionsTable.description,
      pollOptions: questionsTable.pollOptions,
      lang: questionsTable.lang,
    })
    .from(questionsTable)
    .where(eq(questionsTable.id, id));

  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  // Nothing to translate if the question is already in the target language.
  if (question.lang && question.lang === targetLang) {
    return void res.json({
      title: question.title,
      description: question.description,
      pollOptions: question.pollOptions,
      targetLang,
      originalLang: question.lang,
      alreadyInTargetLang: true,
    });
  }

  try {
    const result = await translateQuestion(
      question.title,
      question.description,
      question.pollOptions,
      targetLang,
      question.lang,
    );
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: "Translation failed", detail: err?.message });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

export default router;
