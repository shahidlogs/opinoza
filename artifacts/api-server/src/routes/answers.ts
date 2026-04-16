import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, answersTable, questionsTable, walletsTable, transactionsTable, notificationsTable, usersTable, questionMilestonesTable, answerFlagsTable } from "@workspace/db";
import { eq, desc, and, ilike, isNotNull, sql, inArray, gte, count, ne, or, isNull } from "drizzle-orm";
import { pushQuestionAnswered, pushBonusReceived } from "../lib/push.js";
import { awardReferralAnswerBonus } from "./referrals.js";
import { checkEarningsMilestones } from "../lib/earningsMilestones.js";

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

// ─── Milestone helpers ────────────────────────────────────────────────────────
// Rule 1: Only one milestone — 50 unique answers → one-time $1 (100¢) bonus.
// The unique constraint on (questionId, milestone) prevents double-awarding.
const FIFTY_ANSWER_MILESTONE = 50;
const FIFTY_ANSWER_BONUS_CENTS = 100;

function getMilestoneReward(_milestone: number): number {
  return FIFTY_ANSWER_BONUS_CENTS;
}

function getEarnedMilestones(count: number): number[] {
  return count >= FIFTY_ANSWER_MILESTONE ? [FIFTY_ANSWER_MILESTONE] : [];
}
// ─────────────────────────────────────────────────────────────────────────────

router.post("/answers", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
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

  // Duplicate check — ignore removed answers so the user can answer again
  const [existing] = await db.select({ id: answersTable.id })
    .from(answersTable)
    .where(and(
      eq(answersTable.questionId, questionId),
      eq(answersTable.userId, auth.userId),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
    ));
  if (existing) {
    res.status(409).json({ error: "You have already answered this question" });
    return;
  }

  // Reward guard — if any prior answer exists for this user+question (even removed ones),
  // the user already received their reward. Allow the re-answer but skip all rewards.
  const [priorAnswer] = await db.select({ id: answersTable.id })
    .from(answersTable)
    .where(and(
      eq(answersTable.questionId, questionId),
      eq(answersTable.userId, auth.userId),
    ));
  const alreadyEarned = !!priorAnswer;

  // ── Hourly answer limit: max 20 answers per rolling 60 minutes ───────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [hourlyCount] = await db
    .select({ cnt: count() })
    .from(answersTable)
    .where(and(eq(answersTable.userId, auth.userId), gte(answersTable.createdAt, oneHourAgo)));
  if (Number(hourlyCount?.cnt ?? 0) >= 20) {
    res.status(429).json({ error: "You've reached the hourly answer limit. Please try again later." });
    return;
  }

  // ── Global restriction: block ALL answer types if user has a pending flagged answer
  // Only counts flags on questions that are still active or pending review.
  // If the question was rejected, archived, or deleted the flag is treated as closed.
  const [flaggedAnswer] = await db
    .select({ id: answersTable.id })
    .from(answersTable)
    .innerJoin(
      questionsTable,
      and(
        eq(answersTable.questionId, questionsTable.id),
        inArray(questionsTable.status, ["active", "pending"]),
      ),
    )
    .where(and(eq(answersTable.userId, auth.userId), eq(answersTable.flagStatus, "pending")));
  if (flaggedAnswer) {
    res.status(403).json({
      error: "Your short answer has been flagged and needs correction before you can submit more short answers. Please review and edit it.",
      code: "flagged_answer_restriction",
    });
    return;
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

  // Insert answer
  const [answer] = await db.insert(answersTable).values({
    questionId,
    userId: auth.userId,
    answerText: answerText?.trim() || null,
    pollOption: pollOption || null,
    rating: question.type === "rating" && notFamiliar === true ? null : (rating || null),
    notFamiliar: question.type === "rating" && notFamiliar === true,
    reason: reason?.trim() || null,
  }).returning();

  // Increment question answer count
  await db.update(questionsTable)
    .set({ totalAnswers: question.totalAnswers + 1 })
    .where(eq(questionsTable.id, questionId));

  // ── Name sync: if this is the "Name" profile question, update users.name ──
  if (isNameProfileQuestion(question) && answer.answerText) {
    const nameResult = validateDisplayName(answer.answerText);
    if ("value" in nameResult) {
      await db.update(usersTable)
        .set({ name: nameResult.value })
        .where(eq(usersTable.clerkId, auth.userId));
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Profile questions reward 2¢; regular questions reward 1¢
  const ANSWERER_REWARD_CENTS = question.isProfileQuestion ? 2 : 1;

  // Only issue rewards if the user has never been rewarded for this question before.
  // alreadyEarned is true when a prior answer (even a removed one) exists — meaning
  // they already received their one-time reward. The answer is still saved above; only
  // the financial credit is skipped.
  if (!alreadyEarned) {
    // Ensure answerer has a wallet
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId));
    if (!wallet) {
      [wallet] = await db.insert(walletsTable).values({ userId: auth.userId }).returning();
    }

    // Notify answerer if they just crossed the 10¢ threshold to ask a question
    const crossedAskThreshold = wallet.balanceCents < 10 && wallet.balanceCents + ANSWERER_REWARD_CENTS >= 10;

    // Credit answerer wallet
    await db.update(walletsTable)
      .set({
        balanceCents: wallet.balanceCents + ANSWERER_REWARD_CENTS,
        totalEarnedCents: wallet.totalEarnedCents + ANSWERER_REWARD_CENTS,
      })
      .where(eq(walletsTable.userId, auth.userId));

    // Rules 3 & 4: check if answerer crossed $5 or $10 lifetime earnings
    checkEarningsMilestones(auth.userId).catch(() => {});

    if (crossedAskThreshold) {
      await db.insert(notificationsTable).values({
        userId: auth.userId,
        type: "can_ask_question",
        title: "You can now ask a question!",
        message: "Your balance has reached 10¢ — you're now eligible to submit a custom question.",
      });
    }

    // Record earning transaction
    await db.insert(transactionsTable).values({
      userId: auth.userId,
      type: "earning",
      amountCents: ANSWERER_REWARD_CENTS,
      description: `Answered: "${question.title.substring(0, 60)}"`,
      status: "completed",
      relatedId: answer.id,
    });

    // Creator reward: 0.5¢ per valid answer on user-created questions (isCustom = true).
    // Rules:
    //   - Only fires when question.isCustom is true (user-submitted, not admin-seeded)
    //   - Skipped when the answerer IS the creator (self-reward prevention)
    //   - No admin lookup needed: admin-seeded questions have isCustom = false already
    //   - Idempotency: alreadyEarned guard above prevents double-credit on re-answers
    const CREATOR_REWARD_CENTS = 0.5;

    if (question.isCustom && question.creatorId && question.creatorId !== auth.userId) {
    // Ensure creator has a wallet
    let [creatorWallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, question.creatorId));
    if (!creatorWallet) {
      [creatorWallet] = await db.insert(walletsTable).values({ userId: question.creatorId }).returning();
    }

    // Credit creator wallet
    await db.update(walletsTable)
      .set({
        balanceCents: creatorWallet.balanceCents + CREATOR_REWARD_CENTS,
        totalEarnedCents: creatorWallet.totalEarnedCents + CREATOR_REWARD_CENTS,
      })
      .where(eq(walletsTable.userId, question.creatorId));

    // Rules 3 & 4: check if creator crossed $5 or $10 lifetime earnings
    checkEarningsMilestones(question.creatorId).catch(() => {});

    // Record creator reward transaction
    await db.insert(transactionsTable).values({
      userId: question.creatorId,
      type: "creator_reward",
      amountCents: CREATOR_REWARD_CENTS,
      description: `Creator reward: "${question.title.substring(0, 60)}" was answered`,
      status: "completed",
      relatedId: answer.id,
    });

    // Notify creator: question answered (in-app)
    await db.insert(notificationsTable).values({
      userId: question.creatorId,
      type: "question_answered",
      title: "Your question was answered!",
      message: `Someone answered your question "${question.title.substring(0, 55)}" — you earned ${CREATOR_REWARD_CENTS}¢.`,
      relatedId: question.id,
    });

    // Push notification: question answered — fire-and-forget
    pushQuestionAnswered(question.creatorId, question.title, question.id, answer.id)
      .catch(err => console.error("[push] question_answered error:", err));

    // Email for new answers is disabled (low priority)
    } // end if (question.isCustom && creatorId && creatorId !== answerer)
  } // end if (!alreadyEarned)

  // ── Milestone bonus ──────────────────────────────────────────────────────────
  // Fires for any question that has a creator (creator ≠ answerer).
  // Counts unique non-creator answerers, then rewards newly crossed milestones.
  if (question.creatorId && question.creatorId !== auth.userId) {
    try {
      const [countRow] = await db
        .select({ cnt: sql<number>`COUNT(DISTINCT ${answersTable.userId})::int` })
        .from(answersTable)
        .where(
          and(
            eq(answersTable.questionId, questionId),
            sql`${answersTable.userId} != ${question.creatorId}`,
          ),
        );
      const uniqueAnswerers = Number(countRow?.cnt ?? 0);
      const earned = getEarnedMilestones(uniqueAnswerers);

      if (earned.length > 0) {
        const alreadyRewarded = await db
          .select({ milestone: questionMilestonesTable.milestone })
          .from(questionMilestonesTable)
          .where(eq(questionMilestonesTable.questionId, questionId));
        const rewardedSet = new Set(alreadyRewarded.map(r => r.milestone));
        const newMilestones = earned.filter(m => !rewardedSet.has(m));

        for (const milestone of newMilestones) {
          const rewardCents = getMilestoneReward(milestone);
          try {
            await db.insert(questionMilestonesTable).values({ questionId, milestone, rewardCents });
          } catch {
            continue; // unique constraint — already rewarded in race condition
          }

          let [cw] = await db.select().from(walletsTable).where(eq(walletsTable.userId, question.creatorId!));
          if (!cw) {
            [cw] = await db.insert(walletsTable).values({ userId: question.creatorId! }).returning();
          }
          await db.update(walletsTable)
            .set({
              balanceCents: cw.balanceCents + rewardCents,
              totalEarnedCents: cw.totalEarnedCents + rewardCents,
            })
            .where(eq(walletsTable.userId, question.creatorId!));

          await db.insert(transactionsTable).values({
            userId: question.creatorId!,
            type: "creator_reward",
            amountCents: rewardCents,
            description: `Milestone bonus (${milestone} answers): "${question.title.substring(0, 50)}"`,
            status: "completed",
            relatedId: question.id,
          });

          const rewardLabel = rewardCents >= 100 ? `$${(rewardCents / 100).toFixed(2)}` : `${rewardCents}¢`;
          await db.insert(notificationsTable).values({
            userId: question.creatorId!,
            type: "creator_bonus",
            title: `🎉 Milestone bonus: ${rewardLabel} earned!`,
            message: `Your question "${question.title.substring(0, 55)}" reached ${milestone} unique answers.`,
            relatedId: question.id,
          });

          // Push notification: milestone bonus — fire-and-forget
          pushBonusReceived(
            question.creatorId!,
            `Your question reached ${milestone} answers — you earned ${rewardLabel}!`,
            `milestone_${questionId}_${milestone}`,
            `https://opinoza.com/questions/${questionId}`,
          ).catch(err => console.error("[push] milestone bonus error:", err));
        }
      }
    } catch (err) {
      console.error("[milestone] Error processing milestone bonuses:", err);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Referral answer bonus: 0.5¢ to referrer for each answer by a referred user (fire-and-forget)
  awardReferralAnswerBonus(auth.userId, answer.id).catch(err =>
    console.error("[referrals] answer bonus error:", err)
  );

  const [updatedWallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId));

  res.status(201).json({
    answer: { ...answer, questionTitle: question.title },
    earnedCents: alreadyEarned ? 0 : ANSWERER_REWARD_CENTS,
    newBalance: updatedWallet?.balanceCents ?? 0,
  });
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

  res.json({ hasPendingFlag: flagged.length > 0, flaggedAnswers: flagged });
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
