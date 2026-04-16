import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, questionsTable, answersTable, walletsTable, transactionsTable, usersTable, questionMilestonesTable } from "@workspace/db";
import { eq, count, desc, asc, and, sql, inArray, notInArray, gte, ilike, ne, or, isNull } from "drizzle-orm";
import { VALID_CATEGORIES } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/questions", async (req, res): Promise<void> => {
  const {
    category, type, status = "active",
    limit = "20", offset = "0",
    excludeAnswered, onlyAnswered, order,
    search,
  } = req.query as Record<string, string>;
  const lim = parseInt(limit, 10);
  const off = parseInt(offset, 10);

  // ── Base conditions ───────────────────────────────────────────────────────
  const conditions: ReturnType<typeof eq>[] = [];
  if (status) conditions.push(eq(questionsTable.status, status));
  // Multi-category: filter if the requested category appears anywhere in the categories array.
  // Falls back to the legacy `category` column for questions that predate the migration.
  if (category) conditions.push(sql`${category} = ANY(COALESCE(${questionsTable.categories}, ARRAY[${questionsTable.category}]))` as any);
  if (type) conditions.push(eq(questionsTable.type, type));
  // Exclude profile questions from the main feed
  conditions.push(eq(questionsTable.isProfileQuestion, false));

  // ── Resolve current user's answered question IDs (used in multiple places) ─
  const auth = getAuth(req);
  let userAnsweredIds: number[] = [];
  if (auth?.userId) {
    const answered = await db
      .select({ questionId: answersTable.questionId })
      .from(answersTable)
      .where(eq(answersTable.userId, auth.userId));
    userAnsweredIds = answered.map(a => a.questionId);
  }

  // ── Search mode: rank by (unanswered first, then newest) ─────────────────
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(ilike(questionsTable.title, term) as any);

    const whereClause = and(...conditions);
    const [{ total }] = await db.select({ total: count() }).from(questionsTable).where(whereClause);

    // Sort: group A (unanswered) newest-first, then group B (answered) newest-first
    let questions;
    if (userAnsweredIds.length > 0) {
      const idList = sql.join(userAnsweredIds.map(id => sql`${id}`), sql`, `);
      const answeredExpr = sql`CASE WHEN ${questionsTable.id} = ANY(ARRAY[${idList}]::int[]) THEN 1 ELSE 0 END`;
      questions = await db.select().from(questionsTable)
        .where(whereClause)
        .orderBy(answeredExpr, desc(questionsTable.createdAt))
        .limit(lim).offset(off);
    } else {
      questions = await db.select().from(questionsTable)
        .where(whereClause)
        .orderBy(desc(questionsTable.createdAt))
        .limit(lim).offset(off);
    }

    return void res.json({ questions, total: Number(total) });
  }

  // ── Non-search mode: existing filter + downranking logic ─────────────────

  // When excludeAnswered=true, hide questions the current user has already answered.
  if (excludeAnswered === "true" && userAnsweredIds.length > 0) {
    conditions.push(notInArray(questionsTable.id, userAnsweredIds));
  }

  // When onlyAnswered=true, show only questions the current user has answered.
  if (onlyAnswered === "true") {
    if (userAnsweredIds.length > 0) {
      conditions.push(inArray(questionsTable.id, userAnsweredIds));
    } else {
      // User has answered nothing — return empty result set
      conditions.push(eq(questionsTable.id, -1));
    }
  }

  let query = db.select().from(questionsTable).$dynamic().where(and(...conditions));

  // Downrank questions from creators who earned ≥ $1 (100¢) today.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const cappedCreatorsResult = await db.execute(sql`
    SELECT user_id
    FROM transactions
    WHERE created_at >= ${todayStart}
      AND amount_cents > 0
      AND type IN ('earning', 'creator_reward', 'profile_reward', 'referral_signup_bonus', 'referral_answer_bonus')
    GROUP BY user_id
    HAVING SUM(amount_cents) >= 100
  `);
  const rawRows: any[] = Array.isArray(cappedCreatorsResult)
    ? cappedCreatorsResult
    : (cappedCreatorsResult as any).rows ?? [];
  const cappedCreatorIds: string[] = rawRows.map((r: any) => String(r.user_id));

  const orderDir = order === "asc" ? asc(questionsTable.createdAt) : desc(questionsTable.createdAt);

  // Primary sort: unanswered questions first (0), answered last (1), then createdAt within each group.
  // Only active for authenticated users who have answered at least one question.
  const unansweredFirst = userAnsweredIds.length > 0
    ? sql`CASE WHEN ${questionsTable.id} = ANY(ARRAY[${sql.join(userAnsweredIds.map(id => sql`${id}`), sql`, `)}]::int[]) THEN 1 ELSE 0 END`
    : null;

  let questions;
  if (cappedCreatorIds.length > 0) {
    const idList = sql.join(cappedCreatorIds.map(id => sql`${id}`), sql`, `);
    const downrankExpr = sql`CASE WHEN ${questionsTable.creatorId} = ANY(ARRAY[${idList}]::text[]) THEN 1 ELSE 0 END`;
    questions = unansweredFirst
      ? await query.orderBy(unansweredFirst, downrankExpr, orderDir).limit(lim).offset(off)
      : await query.orderBy(downrankExpr, orderDir).limit(lim).offset(off);
  } else {
    questions = unansweredFirst
      ? await query.orderBy(unansweredFirst, orderDir).limit(lim).offset(off)
      : await query.orderBy(orderDir).limit(lim).offset(off);
  }

  let countQuery = db.select({ total: count() }).from(questionsTable).$dynamic();
  countQuery = countQuery.where(and(...conditions));
  const [{ total }] = await countQuery;

  res.json({ questions, total: Number(total) });
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
  // Filter to only valid canonical categories in application code
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

  res.json({ categories });
});

// GET /api/questions/profile — all active profile questions with user answer status
router.get("/questions/profile", async (req, res): Promise<void> => {
  const auth = getAuth(req);

  const questions = await db.select()
    .from(questionsTable)
    .where(and(
      eq(questionsTable.isProfileQuestion, true),
      eq(questionsTable.status, "active"),
    ))
    .orderBy(asc(questionsTable.id));

  if (!auth?.userId || questions.length === 0) {
    return void res.json({
      questions: questions.map(q => ({ ...q, userHasAnswered: false, userAnswer: null })),
      total: questions.length,
    });
  }

  const questionIds = questions.map(q => q.id);
  const userAnswers = await db.select()
    .from(answersTable)
    .where(and(
      eq(answersTable.userId, auth.userId),
      inArray(answersTable.questionId, questionIds),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
    ));

  const answerMap = new Map(userAnswers.map(a => [a.questionId, a]));

  // For each poll question that the user has answered, include pollResults
  const enriched = await Promise.all(questions.map(async q => {
    const userAnswer = answerMap.get(q.id) ?? null;
    const userHasAnswered = answerMap.has(q.id);

    let pollResults: { option: string; count: number; percentage: number }[] | null = null;
    let ratingAverage: number | null = null;

    if (userHasAnswered && q.type === "poll" && q.pollOptions) {
      const pollAnswers = await db.select({ pollOption: answersTable.pollOption, count: count() })
        .from(answersTable)
        .where(and(
          eq(answersTable.questionId, q.id),
          or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
        ))
        .groupBy(answersTable.pollOption);
      const totalVotes = pollAnswers.reduce((s, r) => s + Number(r.count), 0);
      pollResults = q.pollOptions.map(opt => {
        const found = pollAnswers.find(a => a.pollOption === opt);
        const cnt = found ? Number(found.count) : 0;
        return { option: opt, count: cnt, percentage: totalVotes > 0 ? Math.round((cnt / totalVotes) * 100) : 0 };
      });
    }

    let notFamiliarCount = 0;
    let ratingCount = 0;
    if (userHasAnswered && q.type === "rating") {
      const result = await db.select({
        avg: sql<number>`AVG(${answersTable.rating}) FILTER (WHERE ${answersTable.notFamiliar} = false AND ${answersTable.rating} IS NOT NULL)`,
        ratingCnt: sql<number>`COUNT(*) FILTER (WHERE ${answersTable.notFamiliar} = false AND ${answersTable.rating} IS NOT NULL)`,
        notFamiliarCnt: sql<number>`COUNT(*) FILTER (WHERE ${answersTable.notFamiliar} = true)`,
      }).from(answersTable).where(and(
        eq(answersTable.questionId, q.id),
        or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      ));
      ratingAverage = result[0]?.avg ? parseFloat(String(result[0].avg)) : null;
      ratingCount = result[0]?.ratingCnt ? Number(result[0].ratingCnt) : 0;
      notFamiliarCount = result[0]?.notFamiliarCnt ? Number(result[0].notFamiliarCnt) : 0;
    }

    return { ...q, userHasAnswered, userAnswer, pollResults, ratingAverage, notFamiliarCount, ratingCount };
  }));

  res.json({ questions: enriched, total: enriched.length });
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

    const totalVotes = pollAnswers.reduce((sum, r) => sum + Number(r.count), 0);
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

  // ── Cooldown check (non-admins only) ───────────────────────────────────────
  if (!isAdmin && user?.lastQuestionAt) {
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

  // ── Daily creation limit: max 5 questions per 24 hours (non-admins only) ──
  if (!isAdmin) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(questionsTable)
      .where(and(eq(questionsTable.creatorId, auth.userId), gte(questionsTable.createdAt, since)));
    if (Number(cnt) >= 5) {
      res.status(429).json({
        error: "You have reached your daily limit of 5 questions. Please try again tomorrow.",
        code: "daily_question_limit",
      });
      return;
    }
  }

  if (!isAdmin) {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId));
    if (!wallet || wallet.balanceCents < 20) {
      res.status(402).json({ error: "Insufficient funds. Creating a question costs 20 cents." });
      return;
    }

    await db.update(walletsTable)
      .set({ balanceCents: wallet.balanceCents - 20 })
      .where(eq(walletsTable.userId, auth.userId));

    await db.insert(transactionsTable).values({
      userId: auth.userId,
      type: "question_creation",
      amountCents: -20,
      description: `Custom question creation: "${title}"`,
      status: "completed",
    });
  }

  const [question] = await db.insert(questionsTable).values({
    title,
    description: description || null,
    type,
    category: primaryCategory,
    categories: rawCategories,
    status: isAdmin ? "active" : "pending",
    pollOptions: pollOptions && pollOptions.length > 0 ? pollOptions : null,
    creatorId: auth.userId,
    creatorName: user?.name || null,
    isCustom: true,
  }).returning();

  // ── Record timestamp for cooldown (non-admins only) ────────────────────────
  if (!isAdmin) {
    await db.update(usersTable)
      .set({ lastQuestionAt: new Date() })
      .where(eq(usersTable.clerkId, auth.userId));
  }

  res.status(201).json(question);
});

// ── Bonus progress (creator only) ─────────────────────────────────────────────
// Rule 1: Only milestone is 50 unique answers → one-time $1 (100¢) bonus.
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

  // Only one milestone: 50 answers → $1 bonus (one-time only)
  const MILESTONE = 50;
  const BONUS_CENTS = 100;
  const bonusAlreadyPaid = rewardedMilestones.includes(MILESTONE);

  res.json({
    uniqueAnswerers,
    nextMilestone: bonusAlreadyPaid ? null : MILESTONE,
    nextRewardCents: bonusAlreadyPaid ? null : BONUS_CENTS,
    needed: bonusAlreadyPaid ? 0 : Math.max(0, MILESTONE - uniqueAnswerers),
    progressPercent: bonusAlreadyPaid ? 100 : Math.min(100, Math.round((uniqueAnswerers / MILESTONE) * 100)),
    rewardedMilestones,
    totalRewardedCents,
    bonusAlreadyPaid,
  });
});
// ─────────────────────────────────────────────────────────────────────────────

export default router;
