import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, answersTable, questionsTable, walletsTable, transactionsTable, notificationsTable, usersTable, answerFlagsTable } from "@workspace/db";
import { eq, desc, and, ilike, isNotNull, sql, inArray, gte, count, ne, or, isNull } from "drizzle-orm";
import { pushQuestionAnswered } from "../lib/push.js";
import { awardReferralAnswerBonus } from "./referrals.js";
import { checkEarningsMilestones } from "../lib/earningsMilestones.js";
import { invalidateProfileCache } from "./questions.js";
import { notifCacheInvalidate } from "../lib/notifCache";
import { checkUserBan, checkIpBan, BAN_MESSAGE, IP_BAN_MESSAGE } from "../lib/banCheck.js";
import { getClientIp } from "../lib/clientIp.js";

// ── Name-sync helpers ─────────────────────────────────────────────────────────
function isNameProfileQuestion(question: { isProfileQuestion: boolean; type: string; title: string }): boolean {
  return question.isProfileQuestion && question.type === "short_answer" && question.title.toLowerCase().includes("name");
}

type NameValidResult = { value: string } | { error: string };
function validateDisplayName(raw: string): NameValidResult {
  // Strip HTML/script tags and dangerous characters
  const stripped = raw.replace(/<[^>]*>/g, "").replace(/[<>&"']/g, "").trim();
  if (stripped.length < 2) return { error: "Name must be at least 2 characters" };
  if (stripped.length > 30) return { error: "Name must be 30 characters or fewer" };
  if (/^\d+$/.test(stripped)) return { error: "Name cannot consist of numbers only" };
  return { value: stripped };
}
// ─────────────────────────────────────────────────────────────────────────────

const router: IRouter = Router();

// ── Per-user flag-status cache (60 s TTL) ────────────────────────────────────
// Flag status changes infrequently (only when admin acts on a flag).
// Invalidated when an answer is flagged by the user or admin resolves it.
const FLAG_STATUS_CACHE_TTL_MS = 60_000;
const FLAG_STATUS_CACHE_MAX_SLOTS = 5000;
const flagStatusCache = new Map<string, { data: any; expires: number }>();
function flagStatusCacheGet(userId: string): any | null {
  const e = flagStatusCache.get(userId);
  if (!e || Date.now() > e.expires) { flagStatusCache.delete(userId); return null; }
  return e.data;
}
function flagStatusCacheSet(userId: string, data: any): void {
  if (flagStatusCache.size >= FLAG_STATUS_CACHE_MAX_SLOTS) flagStatusCache.delete(flagStatusCache.keys().next().value!);
  flagStatusCache.set(userId, { data, expires: Date.now() + FLAG_STATUS_CACHE_TTL_MS });
}
export function invalidateFlagStatusCache(userId: string): void { flagStatusCache.delete(userId); }

// ─────────────────────────────────────────────────────────────────────────────

router.post("/answers", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const clientIp = getClientIp(req);

  // ── Ban checks ────────────────────────────────────────────────────────────
  const banStatus = await checkUserBan(auth.userId);
  if (banStatus.banned) {
    console.warn(`[ban] Blocked answer attempt by banned user ${auth.userId}`);
    res.status(403).json({ error: BAN_MESSAGE, code: "account_banned" });
    return;
  }
  if (await checkIpBan(clientIp)) {
    console.warn(`[ban] Blocked answer attempt from banned IP ${clientIp}`);
    res.status(403).json({ error: IP_BAN_MESSAGE, code: "ip_banned" });
    return;
  }

  const { questionId, answerText, pollOption, rating, notFamiliar, reason } = req.body;
  if (!questionId || typeof questionId !== "number") {
    res.status(400).json({ error: "questionId is required and must be a number" });
    return;
  }

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, questionId));
  if (!question || question.status !== "active") {
    res.status(404).json({ error: "Question not found or not active" });
    return;
  }

  // ── Rule 1A: Self-question no-reward check ────────────────────────────────
  // If the user answers their own custom question, accept the answer but zero the reward.
  let noRewardReason: string | null = null;
  if (question.isCustom && question.creatorId && question.creatorId === auth.userId) {
    noRewardReason = "self_question_no_reward";
  }

  // ── Parallel pre-checks ───────────────────────────────────────────────────
  // These three queries are independent after we have the question; run them in
  // one round-trip instead of sequentially (saves ~4 ms per answer at this scale).
  //
  // (A) Combined duplicate + reward-guard: fetch the most-recent answer for this
  //     user+question regardless of flag_status. One query replaces two:
  //     - if flagStatus != 'removed' → already answered (409)
  //     - if any row exists          → reward already issued (alreadyEarned)
  //     Uses idx_answers_user_question (user_id, question_id).
  //
  // (B) Hourly limit: count answers in the last 60 min.
  //     Uses idx_answers_user_created (user_id, created_at DESC).
  //
  // (C) Pending-flag block: detect an unfixed flagged answer on an active question.
  //     Uses idx_answers_flag_status (user_id, flag_status) partial index.
  //
  // (D) Rule 1B: Linked account fingerprint check — only runs when question has
  //     a custom creator who is not the answerer and 1A didn't already fire.
  //     Fetches signupIp + userAgent for both users in one query.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const needLinkedCheck = !noRewardReason && question.isCustom && question.creatorId && question.creatorId !== auth.userId;

  const [[userStatus], [mostRecentAnswer], [hourlyCount], [dailyCount], [flaggedAnswer], linkedFingerprints] = await Promise.all([
    // (0) Viewer admin/editor status — determines whether rate limits apply
    db.select({ isAdmin: usersTable.isAdmin, isEditor: usersTable.isEditor })
      .from(usersTable)
      .where(eq(usersTable.clerkId, auth.userId))
      .limit(1),

    // (A) single query replaces the old duplicate + priorAnswer pair
    db.select({ id: answersTable.id, flagStatus: answersTable.flagStatus })
      .from(answersTable)
      .where(and(eq(answersTable.questionId, questionId), eq(answersTable.userId, auth.userId)))
      .orderBy(desc(answersTable.id))
      .limit(1),

    // (B) Rolling 1-hour answer count (for hourly rate limit)
    db.select({ cnt: count() })
      .from(answersTable)
      .where(and(eq(answersTable.userId, auth.userId), gte(answersTable.createdAt, oneHourAgo))),

    // (B2) Rolling 24-hour answer count (for daily rate limit)
    db.select({ cnt: count() })
      .from(answersTable)
      .where(and(eq(answersTable.userId, auth.userId), gte(answersTable.createdAt, oneDayAgo))),

    // (C) pending-flag block — join to skip flags on inactive/rejected questions
    db.select({ id: answersTable.id })
      .from(answersTable)
      .innerJoin(
        questionsTable,
        and(
          eq(answersTable.questionId, questionsTable.id),
          inArray(questionsTable.status, ["active", "pending"]),
        ),
      )
      .where(and(eq(answersTable.userId, auth.userId), eq(answersTable.flagStatus, "pending")))
      .limit(1),

    // (D) Rule 1B: Linked account fingerprint — fetch both users' signup data when needed
    needLinkedCheck
      ? db.select({ clerkId: usersTable.clerkId, signupIp: usersTable.signupIp, userAgent: usersTable.userAgent })
          .from(usersTable)
          .where(inArray(usersTable.clerkId, [auth.userId, question.creatorId!]))
      : Promise.resolve([]),
  ]);

  // (A) duplicate check — ignore removed answers so the user can re-answer
  const existing =
    mostRecentAnswer &&
    (mostRecentAnswer.flagStatus === null || mostRecentAnswer.flagStatus !== "removed")
      ? mostRecentAnswer
      : null;
  if (existing) {
    res.status(409).json({ error: "You have already answered this question" });
    return;
  }

  // (A) reward guard — any prior answer (even removed) means reward was already issued
  const alreadyEarned = !!mostRecentAnswer;

  // ── Goal 2: Rolling rate limits — normal users only, admins/editors are fully exempt ──
  const isPrivilegedUser = !!(userStatus?.isAdmin || userStatus?.isEditor);
  if (!isPrivilegedUser) {
    if (Number(hourlyCount?.cnt ?? 0) >= 10) {
      res.status(429).json({ error: "You have completed 10 answers in the last hour. Please wait 1 hour before answering more." });
      return;
    }
    if (Number(dailyCount?.cnt ?? 0) >= 50) {
      res.status(429).json({ error: "You have completed 50 answers in the last 24 hours. Please wait until tomorrow before answering more." });
      return;
    }
  }

  // (C) pending-flag block
  if (flaggedAnswer) {
    res.status(403).json({
      error: "Your short answer has been flagged and needs correction before you can submit more short answers. Please review and edit it.",
      code: "flagged_answer_restriction",
    });
    return;
  }

  // (D) Rule 1B: Linked account check — same signupIp AND same userAgent = strong fraud signal
  if (!noRewardReason && needLinkedCheck && linkedFingerprints.length === 2) {
    const answererFp = linkedFingerprints.find(u => u.clerkId === auth.userId);
    const creatorFp  = linkedFingerprints.find(u => u.clerkId === question.creatorId);
    if (
      answererFp?.signupIp && creatorFp?.signupIp &&
      answererFp?.userAgent && creatorFp?.userAgent &&
      answererFp.signupIp === creatorFp.signupIp &&
      answererFp.userAgent === creatorFp.userAgent
    ) {
      noRewardReason = "linked_account_no_reward";
    }
  }

  // Type-specific validation
  if (question.type === "poll") {
    if (!pollOption || typeof pollOption !== "string") {
      res.status(400).json({ error: "pollOption is required for poll questions" });
      return;
    }
    if (!question.pollOptions?.includes(pollOption)) {
      res.status(400).json({ error: "Invalid poll option" });
      return;
    }
  }
  if (question.type === "rating") {
    const isNotFamiliar = notFamiliar === true;
    const hasRating = rating != null && typeof rating === "number" && rating >= 1 && rating <= 5;
    if (isNotFamiliar && hasRating) {
      res.status(400).json({ error: "Cannot submit both a rating and 'not familiar'" });
      return;
    }
    if (!isNotFamiliar && !hasRating) {
      res.status(400).json({ error: "rating must be an integer between 1 and 5, or select 'not familiar'" });
      return;
    }
  }
  if (question.type === "short_answer") {
    if (!answerText || typeof answerText !== "string" || !answerText.trim()) {
      res.status(400).json({ error: "answerText is required for short answer questions" });
      return;
    }
    if (isNameProfileQuestion(question)) {
      const nameResult = validateDisplayName(answerText);
      if ("error" in nameResult) {
        res.status(400).json({ error: nameResult.error });
        return;
      }
      // Also enforce name_locked on new answer submission (edge case: re-answer after delete)
      const [dbUser] = await db.select({ nameLocked: usersTable.nameLocked, isAdmin: usersTable.isAdmin })
        .from(usersTable).where(eq(usersTable.clerkId, auth.userId));
      if (dbUser?.nameLocked && !dbUser.isAdmin) {
        res.status(403).json({ error: "Your profile name is locked. Please contact support to update it.", code: "name_locked" });
        return;
      }
    } else if (answerText.trim().length > 50) {
      res.status(400).json({ error: "Short answer must be 50 characters or fewer" });
      return;
    }
  }
  if (reason && typeof reason === "string" && reason.trim().length > 200) {
    res.status(400).json({ error: "Reason must be 200 characters or fewer" });
    return;
  }

  // Threshold at which a user becomes eligible to ask a custom question.
  // Must match QUESTION_COST_CENTS on the frontend (ask.tsx) and the
  // QUESTION_SUBMISSION_COST guard in questions.ts.
  const ASK_QUESTION_THRESHOLD_CENTS = 25;

  // ── Phase 1: INSERT answer + UPDATE total_answers + SELECT wallet + check prior notif — all in parallel ──
  // These four DB ops are independent: none depends on the others' results.
  // Firing them together saves sequential round-trips off the critical path.
  const [[answer], , walletResult, existingCanAskNotif] = await Promise.all([
    db.insert(answersTable).values({
      questionId,
      userId: auth.userId,
      answerText: answerText?.trim() || null,
      pollOption: pollOption || null,
      rating: question.type === "rating" && notFamiliar === true ? null : (rating || null),
      notFamiliar: question.type === "rating" && notFamiliar === true,
      reason: reason?.trim() || null,
      noRewardReason: noRewardReason || null,
    }).returning(),

    // Atomic increment — no read-then-write race at high concurrency
    db.update(questionsTable)
      .set({ totalAnswers: sql`total_answers + 1` })
      .where(eq(questionsTable.id, questionId)),

    db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId)),

    // Check whether we have already sent the "can ask a question" notification
    // so we never send it more than once (e.g. after a user spends back down and re-earns).
    db.select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, auth.userId),
        eq(notificationsTable.type, "can_ask_question"),
      ))
      .limit(1),
  ]);

  // Invalidate per-user profile cache so the next /questions/profile reflects
  // the answered state immediately (within 30 s at most anyway, but this is instant).
  if (question.isProfileQuestion) invalidateProfileCache(auth.userId);

  // Profile questions reward 2¢; regular questions reward 1¢
  const ANSWERER_REWARD_CENTS = question.isProfileQuestion ? 2 : 1;

  let newBalance = 0;

  // Issue reward only when: (a) not a duplicate answer AND (b) no anti-fraud reason
  if (!alreadyEarned && !noRewardReason) {
    // Use pre-fetched balance for threshold check (accurate to within Phase 1 round-trip).
    // The atomic upsert below is what actually commits the balance change.
    const prevBalance = walletResult[0]?.balanceCents ?? 0;
    const crossedAskThreshold =
      prevBalance < ASK_QUESTION_THRESHOLD_CENTS &&
      prevBalance + ANSWERER_REWARD_CENTS >= ASK_QUESTION_THRESHOLD_CENTS &&
      existingCanAskNotif.length === 0; // skip if already notified

    // ── Phase 2: atomic wallet upsert + transaction record — all in parallel ──
    // Atomic upsert: creates wallet for brand-new users (INSERT) or increments
    // existing balance at the SQL level (ON CONFLICT DO UPDATE).
    // This is race-safe — two concurrent Phase 2s for the same user cannot
    // double-credit because the DB applies each +X independently, not as a
    // read-then-write.
    const phase2: Promise<any>[] = [
      db.insert(walletsTable)
        .values({ userId: auth.userId, balanceCents: ANSWERER_REWARD_CENTS, totalEarnedCents: ANSWERER_REWARD_CENTS })
        .onConflictDoUpdate({
          target: walletsTable.userId,
          set: {
            balanceCents: sql`wallets.balance_cents + ${ANSWERER_REWARD_CENTS}`,
            totalEarnedCents: sql`wallets.total_earned_cents + ${ANSWERER_REWARD_CENTS}`,
          },
        })
        .returning({ balanceCents: walletsTable.balanceCents }),

      db.insert(transactionsTable).values({
        userId: auth.userId,
        type: "earning",
        amountCents: ANSWERER_REWARD_CENTS,
        description: `Answered: "${question.title.substring(0, 60)}"`,
        status: "completed",
        relatedId: answer.id,
      }),
    ];

    // Name sync (only for the "Name" profile short-answer question)
    if (isNameProfileQuestion(question) && answer.answerText) {
      const nameResult = validateDisplayName(answer.answerText);
      if ("value" in nameResult) {
        phase2.push(db.update(usersTable).set({ name: nameResult.value }).where(eq(usersTable.clerkId, auth.userId)));
      }
    }

    if (crossedAskThreshold) {
      phase2.push(db.insert(notificationsTable).values({
        userId: auth.userId,
        type: "can_ask_question",
        title: "You can now ask a question!",
        message: "Your balance has reached 25¢ — you're now eligible to submit a custom question.",
      }));
    }

    const [upsertResult] = await Promise.all(phase2);
    // upsertResult is the RETURNING array from the atomic wallet upsert (phase2[0])
    newBalance = (upsertResult as { balanceCents: number }[])[0]?.balanceCents ?? (prevBalance + ANSWERER_REWARD_CENTS);
    if (crossedAskThreshold) notifCacheInvalidate(auth.userId!);

    // Rules 3 & 4: milestone check — fire-and-forget, doesn't affect response
    checkEarningsMilestones(auth.userId).catch(() => {});
  } else {
    // No reward path: duplicate answer, or anti-fraud rule triggered.
    // Wallet was already fetched in Phase 1; use current balance directly.
    newBalance = walletResult[0]?.balanceCents ?? 0;
    // Name sync still applies even without reward (answer is stored and valid)
    if (!alreadyEarned && isNameProfileQuestion(question) && answer.answerText) {
      const nameResult = validateDisplayName(answer.answerText);
      if ("value" in nameResult) {
        db.update(usersTable).set({ name: nameResult.value }).where(eq(usersTable.clerkId, auth.userId)).catch(() => {});
      }
    }
  }

  // ── Send response now — everything the user sees is committed ────────────
  // Creator reward, referral bonus, and push notification are non-blocking for
  // the answerer and are deferred to after the response to reduce p50/p99 latency.
  const earnedCents = (!alreadyEarned && !noRewardReason) ? ANSWERER_REWARD_CENTS : 0;
  const noRewardMessage = noRewardReason
    ? "Your answer was accepted, but no reward was given because this activity matched our anti-fraud policy."
    : null;

  res.status(201).json({
    answer: { ...answer, questionTitle: question.title },
    earnedCents,
    newBalance,
    ...(noRewardMessage ? { noRewardMessage } : {}),
  });

  // ── Post-response: creator reward (fire-and-forget) ────────────────────────
  //
  // Creator reward: 0.5¢ per valid answer on user-created questions (isCustom = true).
  // Rules:
  //   - Only fires when question.isCustom is true (user-submitted, not admin-seeded)
  //   - Skipped when the answerer IS the creator (self-reward prevention)
  //   - No admin lookup needed: admin-seeded questions have isCustom = false already
  //   - Idempotency: alreadyEarned guard above prevents double-credit on re-answers
  //   - Moved out of the synchronous path — answerer's response is already sent.
  //     Creator notification/wallet update happens within milliseconds after.
  if (!alreadyEarned && !noRewardReason && question.isCustom && question.creatorId && question.creatorId !== auth.userId) {
    const CREATOR_REWARD_CENTS = 0.5;
    const creatorId = question.creatorId;
    const questionTitle = question.title;
    const questionIdVal = question.id;
    const answerId = answer.id;

    ;(async () => {
      // ── Atomic upsert: INSERT wallet if new, atomically increment if exists ──
      // Replaces the old SELECT → optional INSERT → UPDATE pattern which had a
      // read-then-write race under concurrent answers to the same question.
      // Using SQL-level balance_cents + X means the DB applies each +0.5 atomically,
      // so 10 simultaneous answers each add 0.5 independently with no lost updates.
      await db.insert(walletsTable)
        .values({ userId: creatorId, balanceCents: CREATOR_REWARD_CENTS, totalEarnedCents: CREATOR_REWARD_CENTS })
        .onConflictDoUpdate({
          target: walletsTable.userId,
          set: {
            balanceCents: sql`wallets.balance_cents + ${CREATOR_REWARD_CENTS}`,
            totalEarnedCents: sql`wallets.total_earned_cents + ${CREATOR_REWARD_CENTS}`,
          },
        });

      // ── Parallel: transaction record + in-app notification ─────────────────
      // These two inserts are fully independent — fire together for lower latency.
      await Promise.all([
        db.insert(transactionsTable).values({
          userId: creatorId,
          type: "creator_reward",
          amountCents: CREATOR_REWARD_CENTS,
          description: `Creator reward: "${questionTitle.substring(0, 60)}" was answered`,
          status: "completed",
          relatedId: answerId,
        }),
        db.insert(notificationsTable).values({
          userId: creatorId,
          type: "question_answered",
          title: "Your question was answered!",
          message: `Someone answered your question "${questionTitle.substring(0, 55)}" — you earned ${CREATOR_REWARD_CENTS}¢.`,
          relatedId: questionIdVal,
        }),
      ]);
      notifCacheInvalidate(creatorId);

      // Fire-and-forget: milestone check + push notification (non-critical path)
      checkEarningsMilestones(creatorId).catch(() => {});
      pushQuestionAnswered(creatorId, questionTitle, questionIdVal, answerId)
        .catch(err => console.error("[push] question_answered error:", err));
    })().catch(err => console.error("[creator_reward] error:", err));
  }

  // 50-answer milestone bonus is disabled — no new bonuses are awarded.
  // Historical payouts in questionMilestonesTable remain untouched.

  // Referral answer bonus: 0.5¢ to referrer for each answer by a referred user (fire-and-forget)
  // Skipped when anti-fraud rule fired — no bonus for linked/self-farm activities.
  if (!alreadyEarned && !noRewardReason) {
    awardReferralAnswerBonus(auth.userId, answer.id).catch(err =>
      console.error("[referrals] answer bonus error:", err)
    );
  }
});

// Update an existing answer — no reward on edit
router.put("/answers/:id", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const answerId = parseInt(req.params.id, 10);
  if (isNaN(answerId)) {
    res.status(400).json({ error: "Invalid answer id" });
    return;
  }

  const [existing] = await db.select().from(answersTable)
    .where(and(eq(answersTable.id, answerId), eq(answersTable.userId, auth.userId)));
  if (!existing) {
    res.status(404).json({ error: "Answer not found or not yours" });
    return;
  }

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, existing.questionId));
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return;
  }

  const { answerText, pollOption, rating, notFamiliar, reason } = req.body;

  // Type-specific validation
  if (question.type === "poll") {
    if (!pollOption || typeof pollOption !== "string") {
      res.status(400).json({ error: "pollOption is required for poll questions" });
      return;
    }
    if (!question.pollOptions?.includes(pollOption)) {
      res.status(400).json({ error: "Invalid poll option" });
      return;
    }
  }
  if (question.type === "rating") {
    const isNotFamiliar = notFamiliar === true;
    const hasRating = rating != null && typeof rating === "number" && rating >= 1 && rating <= 5;
    if (isNotFamiliar && hasRating) {
      res.status(400).json({ error: "Cannot submit both a rating and 'not familiar'" });
      return;
    }
    if (!isNotFamiliar && !hasRating) {
      res.status(400).json({ error: "rating must be an integer between 1 and 5, or select 'not familiar'" });
      return;
    }
  }
  if (question.type === "short_answer") {
    if (!answerText || typeof answerText !== "string" || !answerText.trim()) {
      res.status(400).json({ error: "answerText is required for short answer questions" });
      return;
    }
    if (isNameProfileQuestion(question)) {
      const nameResult = validateDisplayName(answerText);
      if ("error" in nameResult) {
        res.status(400).json({ error: nameResult.error });
        return;
      }
      const [dbUser] = await db.select({ nameLocked: usersTable.nameLocked, isAdmin: usersTable.isAdmin })
        .from(usersTable).where(eq(usersTable.clerkId, auth.userId));
      if (dbUser?.nameLocked && !dbUser.isAdmin) {
        res.status(403).json({ error: "Your profile name is locked. Please contact support to update it.", code: "name_locked" });
        return;
      }
    } else if (answerText.trim().length > 50) {
      res.status(400).json({ error: "Short answer must be 50 characters or fewer" });
      return;
    }
  }
  if (reason && typeof reason === "string" && reason.trim().length > 200) {
    res.status(400).json({ error: "Reason must be 200 characters or fewer" });
    return;
  }

  const clearFlag = question.type === "short_answer" && existing.flagStatus === "pending";

  const [updated] = await db.update(answersTable)
    .set({
      answerText: question.type === "short_answer" ? (answerText?.trim() || null) : existing.answerText,
      pollOption: question.type === "poll" ? (pollOption || null) : existing.pollOption,
      rating: question.type === "rating"
        ? (notFamiliar === true ? null : (rating || null))
        : existing.rating,
      notFamiliar: question.type === "rating" ? (notFamiliar === true) : existing.notFamiliar,
      reason: reason?.trim() || null,
      ...(clearFlag ? { flagStatus: "resolved" } : {}),
    })
    .where(eq(answersTable.id, answerId))
    .returning();

  // ── Name sync: if this is the "Name" profile question, update users.name ──
  if (isNameProfileQuestion(question) && updated.answerText) {
    const nameResult = validateDisplayName(updated.answerText);
    if ("value" in nameResult) {
      await db.update(usersTable)
        .set({ name: nameResult.value })
        .where(eq(usersTable.clerkId, auth.userId));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Resolve all pending flags on this answer when user edits
  if (clearFlag) {
    await db.update(answerFlagsTable)
      .set({ status: "resolved" })
      .where(and(eq(answerFlagsTable.answerId, answerId), eq(answerFlagsTable.status, "pending")));
  }

  res.json({ answer: updated, updated: true, flagCleared: clearFlag });
});

router.get("/answers/my", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const answers = await db.select({
    id: answersTable.id,
    questionId: answersTable.questionId,
    questionTitle: questionsTable.title,
    userId: answersTable.userId,
    answerText: answersTable.answerText,
    pollOption: answersTable.pollOption,
    rating: answersTable.rating,
    reason: answersTable.reason,
    createdAt: answersTable.createdAt,
  }).from(answersTable)
    .leftJoin(questionsTable, eq(answersTable.questionId, questionsTable.id))
    .where(and(
      eq(answersTable.userId, auth.userId),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
    ))
    .orderBy(desc(answersTable.createdAt))
    .limit(50);

  res.json({ answers });
});

// GET /api/questions/:id/answers
// Returns individual answers for a question with display names and reasons.
// Public (no auth required); if authenticated, marks the caller's own answer.
router.get("/questions/:id/answers", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) { res.status(400).json({ error: "Invalid question id" }); return; }

  const [q] = await db.select({ status: questionsTable.status }).from(questionsTable).where(eq(questionsTable.id, id));
  if (!q || q.status === "hidden" || q.status === "archived_duplicate") {
    res.status(404).json({ error: "Question not found" }); return;
  }

  const auth = getAuth(req);
  const currentUserId = auth?.userId ?? null;

  const rows = await db
    .select({
      id: answersTable.id,
      userId: answersTable.userId,
      answerText: answersTable.answerText,
      pollOption: answersTable.pollOption,
      rating: answersTable.rating,
      notFamiliar: answersTable.notFamiliar,
      reason: answersTable.reason,
      createdAt: answersTable.createdAt,
      userName: usersTable.name,
    })
    .from(answersTable)
    .leftJoin(usersTable, eq(usersTable.clerkId, answersTable.userId))
    .where(and(
      eq(answersTable.questionId, id),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
    ))
    .orderBy(
      sql`CASE WHEN ${answersTable.reason} IS NOT NULL AND trim(${answersTable.reason}) != '' THEN 0 ELSE 1 END`,
      desc(answersTable.createdAt),
    );

  const answers = rows.map(a => ({
    id: a.id,
    isOwn: a.userId === currentUserId,
    displayName: a.userId === currentUserId
      ? "You"
      : (a.userName ? a.userName.split(" ")[0] : "Anonymous"),
    answerText: a.answerText,
    pollOption: a.pollOption,
    rating: a.rating,
    notFamiliar: a.notFamiliar,
    reason: a.reason?.trim() || null,
    createdAt: a.createdAt,
  }));

  res.json({ answers, total: answers.length });
});

// GET /api/questions/:id/text-stats
// Returns grouped answer counts for a short-answer question (top 7 + Other bucket).
// No auth required — stats are public.
router.get("/questions/:id/text-stats", async (req, res): Promise<void> => {
  const questionId = parseInt(req.params.id, 10);
  if (isNaN(questionId) || questionId <= 0) {
    res.json({ groups: [], total: 0 });
    return;
  }

  const [q] = await db.select({ status: questionsTable.status }).from(questionsTable).where(eq(questionsTable.id, questionId));
  if (!q || q.status === "hidden" || q.status === "archived_duplicate") {
    res.status(404).json({ error: "Question not found" }); return;
  }

  // Group by lower(trim(answer_text)) in Postgres, keep a representative display label
  // Exclude removed answers from stats
  const rows = await db.execute(sql`
    SELECT
      lower(trim(answer_text))        AS key,
      min(answer_text)                AS label,
      cast(count(*) as integer)       AS count
    FROM answers
    WHERE question_id = ${questionId}
      AND answer_text IS NOT NULL
      AND trim(answer_text) <> ''
      AND (flag_status IS NULL OR flag_status != 'removed')
    GROUP BY lower(trim(answer_text))
    ORDER BY count DESC
    LIMIT 20
  `);

  // db.execute returns { rows: [...] } for drizzle-orm postgres
  const rawRows: any[] = Array.isArray(rows) ? rows : (rows as any).rows ?? [];
  const allGroups = rawRows.map(r => ({
    key:   String(r.key),
    label: String(r.label).trim(),
    count: Number(r.count),
  }));

  // Total distinct-answer submissions (may differ from question.totalAnswers for mixed types)
  const total = allGroups.reduce((s, g) => s + g.count, 0);

  const TOP = 7;
  const top = allGroups.slice(0, TOP);
  const otherCount = allGroups.slice(TOP).reduce((s, g) => s + g.count, 0);

  const groups = top.map(g => ({
    label:      g.label,
    count:      g.count,
    percentage: total > 0 ? Math.round((g.count / total) * 100) : 0,
  }));

  if (otherCount > 0) {
    groups.push({
      label:      "Other",
      count:      otherCount,
      percentage: total > 0 ? Math.round((otherCount / total) * 100) : 0,
    });
  }

  res.json({ groups, total });
});

// GET /api/questions/:id/suggestions?q=<search>
// Returns up to 5 deduplicated existing short-answer texts for a given question
// that case-insensitively contain the query string. No auth required.
router.get("/questions/:id/suggestions", async (req, res): Promise<void> => {
  const questionId = parseInt(req.params.id, 10);
  if (isNaN(questionId) || questionId <= 0) {
    res.json({ suggestions: [] });
    return;
  }

  const [qs] = await db.select({ status: questionsTable.status }).from(questionsTable).where(eq(questionsTable.id, questionId));
  if (!qs || qs.status === "hidden" || qs.status === "archived_duplicate") {
    res.status(404).json({ error: "Question not found" }); return;
  }

  const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
  if (q.length < 2) {
    res.json({ suggestions: [] });
    return;
  }

  const rows = await db
    .select({ answerText: answersTable.answerText })
    .from(answersTable)
    .where(
      and(
        eq(answersTable.questionId, questionId),
        isNotNull(answersTable.answerText),
        ilike(answersTable.answerText, `%${q}%`),
        or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      ),
    )
    .limit(200);

  // Deduplicate case-insensitively, preserve original casing of first occurrence
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const row of rows) {
    if (!row.answerText) continue;
    const key = row.answerText.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(key)) {
      seen.add(key);
      suggestions.push(row.answerText.trim());
      if (suggestions.length === 5) break;
    }
  }

  res.json({ suggestions });
});

// ── GET /answers/my-flag-status ────────────────────────────────────────────
// Returns whether the current user has any pending flagged short answers.
router.get("/answers/my-flag-status", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.json({ hasPendingFlag: false, flaggedAnswers: [] }); return; }

  const hit = flagStatusCacheGet(auth.userId);
  if (hit) return void res.json(hit);

  // Only report flags on questions still active or pending review.
  // Flags on rejected/archived/deleted questions are treated as closed.
  const flagged = await db
    .select({
      id: answersTable.id,
      answerText: answersTable.answerText,
      questionId: answersTable.questionId,
      flagStatus: answersTable.flagStatus,
      questionTitle: questionsTable.title,
    })
    .from(answersTable)
    .innerJoin(
      questionsTable,
      and(
        eq(answersTable.questionId, questionsTable.id),
        inArray(questionsTable.status, ["active", "pending"]),
      ),
    )
    .where(and(eq(answersTable.userId, auth.userId), eq(answersTable.flagStatus, "pending")));

  const payload = { hasPendingFlag: flagged.length > 0, flaggedAnswers: flagged };
  flagStatusCacheSet(auth.userId, payload);
  res.json(payload);
});

// ── POST /answers/:id/flag ─────────────────────────────────────────────────
// Flag a short answer. Each user can only flag each answer once.
router.post("/answers/:id/flag", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const answerId = parseInt(req.params.id, 10);
  if (isNaN(answerId)) { res.status(400).json({ error: "Invalid answer id" }); return; }

  const VALID_REASONS = [
    "Meaningless or unclear",
    "Spam or repeated text",
    "Abusive or inappropriate",
    "Spelling/capitalization issue",
  ];

  const { reason } = req.body;
  if (!reason || !VALID_REASONS.includes(reason)) {
    res.status(400).json({ error: "Invalid flag reason", validReasons: VALID_REASONS });
    return;
  }

  // Ensure the answer exists
  const [answer] = await db.select().from(answersTable).where(eq(answersTable.id, answerId));
  if (!answer) { res.status(404).json({ error: "Answer not found" }); return; }

  // Cannot flag your own answer
  if (answer.userId === auth.userId) {
    res.status(403).json({ error: "You cannot flag your own answer" });
    return;
  }

  // Insert flag (unique constraint prevents duplicate from same user)
  try {
    await db.insert(answerFlagsTable).values({
      answerId,
      flaggedByUserId: auth.userId,
      reason,
      status: "pending",
    });
  } catch {
    res.status(409).json({ error: "You have already flagged this answer" });
    return;
  }

  // Mark the answer as pending-flagged
  await db.update(answersTable)
    .set({ flagStatus: "pending" })
    .where(eq(answersTable.id, answerId));

  // Email for flagged answers is disabled (low priority)

  res.json({ success: true });
});

export default router;
