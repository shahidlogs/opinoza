import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, questionsTable, usersTable, transactionsTable, answersTable, walletsTable, notificationsTable, answerFlagsTable, pushNotificationLogsTable } from "@workspace/db";
import { sendEmail, withdrawalApprovedEmail, withdrawalRejectedEmail, questionRejectedEmail } from "../lib/email.js";
import { pushQuestionApproved, pushBonusReceived, PUSH_CONFIG } from "../lib/push.js";
import { eq, count, sum, and, gte, desc, inArray, sql as drizzleSql } from "drizzle-orm";

const router: IRouter = Router();

async function checkAdmin(req: any, res: any): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!user?.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return auth.userId;
}

function parseId(raw: string | string[]): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(str, 10);
}

// List questions with optional status filter
router.get("/admin/questions", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const { status } = req.query as Record<string, string>;
  let query = db.select().from(questionsTable).$dynamic();
  if (status) {
    query = query.where(eq(questionsTable.status, status));
  }
  const questions = await query.orderBy(desc(questionsTable.createdAt));
  res.json({ questions, total: questions.length });
});

// Approve question
router.post("/admin/questions/:id/approve", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);
  const [question] = await db.update(questionsTable)
    .set({ status: "active" })
    .where(eq(questionsTable.id, id))
    .returning();
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  // Notify creator that their question is live
  if (question.creatorId) {
    await db.insert(notificationsTable).values({
      userId: question.creatorId,
      type: "question_approved",
      title: "Question approved! 🎉",
      message: `"${question.title.substring(0, 60)}" is now live and earning you 0.5¢ per answer.`,
      relatedId: question.id,
    });
    // Push notification — fire-and-forget (question approved email is disabled)
    pushQuestionApproved(question.creatorId!, question.title, question.id)
      .catch(err => console.error("[push] question_approved error:", err));
  }

  res.json(question);
});

// Reject question (with optional refund)
const REJECTION_REASONS = [
  "Not an opinion, preference, habit, or behavior-based question",
  "Unclear or confusing meaning",
  "Grammar or spelling mistakes",
  "Missing or weak description",
  "Duplicate or very similar question",
  "Not suitable for our platform",
] as const;

router.post("/admin/questions/:id/reject", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;
  const id = parseId(req.params.id);

  const { rejectionReason } = req.body;
  if (!rejectionReason || !REJECTION_REASONS.includes(rejectionReason)) {
    res.status(400).json({ error: "Invalid or missing rejection reason" });
    return;
  }

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const [updated] = await db.update(questionsTable)
    .set({ status: "rejected", rejectionReason, rejectedAt: new Date(), rejectedBy: adminId })
    .where(eq(questionsTable.id, id))
    .returning();

  // Refund 20 cents to creator if question was pending
  const QUESTION_COST_CENTS = 20;
  if (question.status === "pending" && question.creatorId) {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, question.creatorId));
    if (wallet) {
      await db.update(walletsTable)
        .set({ balanceCents: wallet.balanceCents + QUESTION_COST_CENTS })
        .where(eq(walletsTable.userId, question.creatorId));
      await db.insert(transactionsTable).values({
        userId: question.creatorId,
        type: "earning",
        amountCents: QUESTION_COST_CENTS,
        description: `Refund: rejected question "${question.title.substring(0, 50)}"`,
        status: "completed",
      });
    }
  }

  // Clear any pending flags on answers to this question — the question is gone so
  // the flags are now moot and must not continue blocking users from answering.
  const pendingFlaggedAnswers = await db
    .select({ id: answersTable.id })
    .from(answersTable)
    .where(and(eq(answersTable.questionId, id), eq(answersTable.flagStatus, "pending")));
  if (pendingFlaggedAnswers.length > 0) {
    const pendingIds = pendingFlaggedAnswers.map(a => a.id);
    await db.update(answersTable)
      .set({ flagStatus: null })
      .where(and(eq(answersTable.questionId, id), eq(answersTable.flagStatus, "pending")));
    await db.update(answerFlagsTable)
      .set({ status: "ignored" })
      .where(and(inArray(answerFlagsTable.answerId, pendingIds), eq(answerFlagsTable.status, "pending")));
  }

  // Notify creator of rejection
  const wasRefunded = question.status === "pending";
  if (question.creatorId) {
    const refundNote = wasRefunded ? " Your 20¢ has been refunded." : "";
    await db.insert(notificationsTable).values({
      userId: question.creatorId,
      type: "question_rejected",
      title: "Question rejected",
      message: `Your question was rejected.\nReason: ${rejectionReason}${refundNote}`,
      relatedId: id,
    });
    // Email — fire-and-forget
    ;(async () => {
      try {
        const [creator] = await db.select({ email: usersTable.email, name: usersTable.name })
          .from(usersTable).where(eq(usersTable.clerkId, question.creatorId!));
        if (creator?.email) {
          const mail = questionRejectedEmail({ name: creator.name, questionTitle: question.title, refunded: wasRefunded, reason: rejectionReason });
          const ok = await sendEmail({ to: creator.email, subject: mail.subject, html: mail.html, text: mail.text });
          if (ok) console.info(`[email] Question rejected email sent to ${creator.email} (question ${id})`);
        }
      } catch (err) { console.error("[email] Question rejected email error:", err); }
    })();
  }

  res.json(updated);
});

// Edit question (title, description, type, category, pollOptions, status)
router.patch("/admin/questions/:id", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);

  const { title, description, type, category, categories: rawCats, pollOptions, status, isProfileQuestion } = req.body;

  const updates: Record<string, any> = {};
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (type !== undefined) updates.type = type;

  // Support updating via the new `categories` array OR legacy single `category` string.
  if (rawCats !== undefined && Array.isArray(rawCats) && rawCats.length > 0) {
    updates.categories = rawCats.slice(0, 3);
    updates.category = rawCats[0];
  } else if (category !== undefined) {
    updates.category = category;
    updates.categories = [category];
  }

  if (status !== undefined) updates.status = status;
  if (pollOptions !== undefined) updates.pollOptions = Array.isArray(pollOptions) && pollOptions.length > 0 ? pollOptions : null;
  if (isProfileQuestion !== undefined) updates.isProfileQuestion = Boolean(isProfileQuestion);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [question] = await db.update(questionsTable)
    .set(updates)
    .where(eq(questionsTable.id, id))
    .returning();

  if (!question) { res.status(404).json({ error: "Question not found" }); return; }
  res.json(question);
});

// Set/unset featured status and position for a question
router.patch("/admin/questions/:id/featured", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);
  const { isFeatured, featuredPosition } = req.body as { isFeatured: boolean; featuredPosition?: number | null };

  if (typeof isFeatured !== "boolean") {
    res.status(400).json({ error: "isFeatured (boolean) is required" });
    return;
  }

  const [question] = await db.update(questionsTable)
    .set({
      isFeatured,
      featuredPosition: isFeatured ? (featuredPosition ?? null) : null,
    })
    .where(eq(questionsTable.id, id))
    .returning();

  if (!question) { res.status(404).json({ error: "Question not found" }); return; }
  res.json(question);
});

// Archive question as duplicate (soft-hide — preserves all answers, earnings, and transactions)
router.post("/admin/questions/:id/archive-duplicate", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  if (question.status === "archived_duplicate") {
    res.status(400).json({ error: "Question is already archived as a duplicate" });
    return;
  }

  const [updated] = await db.update(questionsTable)
    .set({ status: "archived_duplicate" })
    .where(eq(questionsTable.id, id))
    .returning();

  // Clear any pending flags on answers to this question — archiving closes the issue
  // so flagged answers must not continue blocking users from answering other questions.
  const archivedFlaggedAnswers = await db
    .select({ id: answersTable.id })
    .from(answersTable)
    .where(and(eq(answersTable.questionId, id), eq(answersTable.flagStatus, "pending")));
  if (archivedFlaggedAnswers.length > 0) {
    const pendingIds = archivedFlaggedAnswers.map(a => a.id);
    await db.update(answersTable)
      .set({ flagStatus: null })
      .where(and(eq(answersTable.questionId, id), eq(answersTable.flagStatus, "pending")));
    await db.update(answerFlagsTable)
      .set({ status: "ignored" })
      .where(and(inArray(answerFlagsTable.answerId, pendingIds), eq(answerFlagsTable.status, "pending")));
  }

  // Notify creator that their question was archived
  if (question.creatorId) {
    await db.insert(notificationsTable).values({
      userId: question.creatorId,
      type: "question_rejected",
      title: "Question archived",
      message: `"${question.title.substring(0, 60)}" was archived as a duplicate. All your earnings from this question are preserved.`,
      relatedId: id,
    });
  }

  res.json(updated);
});

// Delete question — SAFE: blocks hard delete if the question already has answers or financial activity.
// For questions with activity, use archive-duplicate or set status=hidden instead.
router.delete("/admin/questions/:id", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);

  const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, id));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  // Guard: refuse hard-delete if the question has any answers (financial or otherwise).
  // Deleting answers destroys user participation history, earning context, and stats.
  const [{ answerCount }] = await db
    .select({ answerCount: count() })
    .from(answersTable)
    .where(eq(answersTable.questionId, id));

  if (Number(answerCount) > 0) {
    res.status(409).json({
      error: "Cannot delete — this question has existing answers and financial history.",
      answerCount: Number(answerCount),
      suggestion: "Use 'Archive as Duplicate' to hide it from public view while preserving all earnings and answer records.",
    });
    return;
  }

  // Safe to hard-delete: no answers, no financial impact.
  await db.delete(questionsTable).where(eq(questionsTable.id, id));
  res.json({ success: true });
});

// List users with per-user stats
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  // 1. Base user list — the original simple query that always works
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));

  if (users.length === 0) {
    res.json({ users: [] });
    return;
  }

  // 2. Per-user aggregates via simple GROUP BY queries (no subqueries, no sql template columns)
  const [qCounts, aCounts, eCounts, wallets] = await Promise.all([
    db.select({ creatorId: questionsTable.creatorId, total: count() })
      .from(questionsTable)
      .groupBy(questionsTable.creatorId),

    db.select({ userId: answersTable.userId, total: count() })
      .from(answersTable)
      .groupBy(answersTable.userId),

    db.select({ userId: transactionsTable.userId, total: sum(transactionsTable.amountCents) })
      .from(transactionsTable)
      .where(inArray(transactionsTable.type, ["earning", "profile_reward", "creator_reward"]))
      .groupBy(transactionsTable.userId),

    db.select({ userId: walletsTable.userId, balance: walletsTable.balanceCents })
      .from(walletsTable),
  ]);

  // 3. Build lookup maps
  const qMap: Record<string, number> = {};
  for (const r of qCounts) if (r.creatorId) qMap[r.creatorId] = Number(r.total);

  const aMap: Record<string, number> = {};
  for (const r of aCounts) aMap[r.userId] = Number(r.total);

  const eMap: Record<string, number> = {};
  for (const r of eCounts) eMap[r.userId] = Number(r.total ?? 0);

  const wMap: Record<string, number> = {};
  for (const r of wallets) wMap[r.userId] = Number(r.balance ?? 0);

  // 4. Merge — every user appears regardless of whether they have counts or not
  const enriched = users.map(u => ({
    ...u,
    questionCount: qMap[u.clerkId] ?? 0,
    answerCount: aMap[u.clerkId] ?? 0,
    earningsCents: eMap[u.clerkId] ?? 0,
    balanceCents: wMap[u.clerkId] ?? 0,
  }));

  res.json({ users: enriched });
});

router.get("/admin/users/:id/answers", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const clerkId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const answers = await db.select({
    id: answersTable.id,
    questionId: answersTable.questionId,
    answerText: answersTable.answerText,
    pollOption: answersTable.pollOption,
    rating: answersTable.rating,
    reason: answersTable.reason,
    createdAt: answersTable.createdAt,
    questionTitle: questionsTable.title,
    questionType: questionsTable.type,
    questionCategory: questionsTable.category,
  })
    .from(answersTable)
    .leftJoin(questionsTable, eq(answersTable.questionId, questionsTable.id))
    .where(eq(answersTable.userId, clerkId))
    .orderBy(desc(answersTable.createdAt))
    .limit(100);

  res.json({ answers });
});

// Toggle admin status
router.patch("/admin/users/:id/toggle-admin", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, raw));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [updated] = await db.update(usersTable)
    .set({ isAdmin: !user.isAdmin })
    .where(eq(usersTable.clerkId, raw))
    .returning();
  res.json(updated);
});

// Growth over time (time-series data for charts)
router.get("/admin/growth", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const daysParam = req.query.days as string;
  const days = daysParam && daysParam !== "all" ? parseInt(daysParam, 10) : null;
  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : new Date("2000-01-01");

  const [usersRows, questionsRows, answersRows, earningsRows] = await Promise.all([
    db.execute(drizzleSql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${cutoff}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date
    `),
    db.execute(drizzleSql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM questions
      WHERE created_at >= ${cutoff}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date
    `),
    db.execute(drizzleSql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS count
      FROM answers
      WHERE created_at >= ${cutoff}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date
    `),
    db.execute(drizzleSql`
      SELECT TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
             COALESCE(SUM(amount_cents), 0)::float AS total
      FROM transactions
      WHERE type IN ('earning', 'profile_reward', 'creator_reward')
        AND created_at >= ${cutoff}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date
    `),
  ]);

  res.json({
    users: usersRows.rows,
    questions: questionsRows.rows,
    answers: answersRows.rows,
    earnings: earningsRows.rows,
  });
});

// Platform stats
router.get("/admin/stats", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const [userCount] = await db.select({ count: count() }).from(usersTable);
  const [questionCount] = await db.select({ count: count() }).from(questionsTable);
  const [pendingCount] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.status, "pending"));
  const [answerCount] = await db.select({ count: count() }).from(answersTable)
    .where(drizzleSql`(${answersTable.flagStatus} IS NULL OR ${answersTable.flagStatus} != 'removed')`);

  // Total earned = all genuine platform payouts to users (positive transactions only).
  // Includes: answer rewards (earning type, positive only to exclude refund noise),
  // creator rewards, profile rewards, and all referral bonuses.
  const earnedResult = await db.execute(drizzleSql`
    SELECT COALESCE(SUM(amount_cents), 0)::float AS total
    FROM transactions
    WHERE type IN ('earning', 'creator_reward', 'profile_reward', 'referral_signup_bonus', 'referral_answer_bonus')
      AND amount_cents > 0
  `);
  const earnedRows: any[] = Array.isArray(earnedResult) ? earnedResult : (earnedResult as any).rows ?? [];
  const totalEarnedCents = Number(earnedRows[0]?.total ?? 0);

  // "Withdrawn" for stats = only truly transferred (admin clicked Transfer)
  const withdrawnResult = await db.select({ total: sum(transactionsTable.amountCents) })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "withdrawal"),
      eq(transactionsTable.status, "transferred"),
    ));
  const totalWithdrawnCents = Math.abs(Number(withdrawnResult[0]?.total ?? 0));

  // "Pending" for stats = not yet paid (pending + approved + legacy completed all still owe payment)
  const pendingWithdrawalResult = await db.select({ total: sum(transactionsTable.amountCents) })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "withdrawal"),
      inArray(transactionsTable.status, ["pending", "approved", "completed"]),
    ));
  const pendingWithdrawalCents = Math.abs(Number(pendingWithdrawalResult[0]?.total ?? 0));

  // Active users this week = DISTINCT users who submitted at least one answer in the last 7 days.
  // Previously used COUNT(*) on answer rows — this inflated the number to match total answers, not users.
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const activeUsersResult = await db.execute(drizzleSql`
    SELECT COUNT(DISTINCT user_id)::int AS cnt
    FROM answers
    WHERE created_at >= ${weekAgo}
      AND (flag_status IS NULL OR flag_status != 'removed')
  `);
  const activeUsersRows: any[] = Array.isArray(activeUsersResult) ? activeUsersResult : (activeUsersResult as any).rows ?? [];
  const activeUsersThisWeek = Number(activeUsersRows[0]?.cnt ?? 0);

  // Never cache stats — always return fresh live counts.
  res.set("Cache-Control", "no-store");
  res.json({
    totalUsers: Number(userCount?.count ?? 0),
    totalQuestions: Number(questionCount?.count ?? 0),
    pendingQuestions: Number(pendingCount?.count ?? 0),
    totalAnswers: Number(answerCount?.count ?? 0),
    totalEarnedCents,
    totalWithdrawnCents,
    pendingWithdrawalCents,
    activeUsersThisWeek,
  });
});

// Withdrawal management
router.get("/admin/withdrawals", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const rows = await db.select({
    id: transactionsTable.id,
    userId: transactionsTable.userId,
    type: transactionsTable.type,
    amountCents: transactionsTable.amountCents,
    description: transactionsTable.description,
    status: transactionsTable.status,
    relatedId: transactionsTable.relatedId,
    accountTitle: transactionsTable.accountTitle,
    bankName: transactionsTable.bankName,
    approvedAt: transactionsTable.approvedAt,
    transferredAt: transactionsTable.transferredAt,
    createdAt: transactionsTable.createdAt,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userClerkId: usersTable.clerkId,
  })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(usersTable.clerkId, transactionsTable.userId))
    .where(eq(transactionsTable.type, "withdrawal"))
    .orderBy(desc(transactionsTable.createdAt));

  res.json({ transactions: rows });
});

router.post("/admin/withdrawals/:id/approve", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);

  const [transaction] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!transaction) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (transaction.status !== "pending") {
    res.status(400).json({ error: "Withdrawal is not pending" });
    return;
  }

  const [updated] = await db.update(transactionsTable)
    .set({ status: "approved", approvedAt: new Date() })
    .where(eq(transactionsTable.id, id))
    .returning();

  const withdrawAmount = Math.abs(transaction.amountCents);

  // In-app notification
  await db.insert(notificationsTable).values({
    userId: transaction.userId,
    type: "withdrawal_approved",
    title: "Withdrawal approved!",
    message: `Your withdrawal request of $${(withdrawAmount / 100).toFixed(2)} has been approved. The payment will be transferred to your account shortly.`,
    relatedId: transaction.id,
  }).catch(err => console.error("[withdrawal] Failed to insert notification:", err));

  // Email + push — fire-and-forget
  const [userRow] = await db.select().from(usersTable).where(eq(usersTable.clerkId, transaction.userId));
  if (userRow?.email) {
    const mail = withdrawalApprovedEmail({ name: userRow.name, amountCents: withdrawAmount });
    sendEmail({ to: userRow.email, subject: mail.subject, html: mail.html, text: mail.text })
      .then(ok => {
        if (ok) console.info(`[email] Withdrawal approval email sent to ${userRow.email}`);
        else console.warn(`[email] Withdrawal approval email failed (sendEmail returned false) for ${userRow.email}`);
      })
      .catch(err => console.error("[email] Withdrawal approval email error:", err));
  } else {
    console.warn(`[withdrawal] No email found for userId ${transaction.userId} — approval email skipped`);
  }
  pushBonusReceived(
    transaction.userId,
    `Your withdrawal of $${(withdrawAmount / 100).toFixed(2)} has been approved.`,
    `withdrawal_approved_${transaction.id}`,
  ).catch(err => console.error("[push] withdrawal approved error:", err));

  res.json(updated);
});

// Mark a withdrawal as transferred (payment actually sent)
router.post("/admin/withdrawals/:id/transfer", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);

  const [transaction] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!transaction) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (transaction.status !== "approved" && transaction.status !== "completed") {
    res.status(400).json({ error: "Withdrawal must be approved before marking as transferred" });
    return;
  }

  const now = new Date();
  const [updated] = await db.update(transactionsTable)
    .set({ status: "transferred", transferredAt: now })
    .where(eq(transactionsTable.id, id))
    .returning();

  // Update wallet's totalWithdrawnCents — payment has actually been sent
  const withdrawAmount = Math.abs(transaction.amountCents);
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, transaction.userId));
  if (wallet) {
    await db.update(walletsTable)
      .set({ totalWithdrawnCents: wallet.totalWithdrawnCents + withdrawAmount })
      .where(eq(walletsTable.userId, transaction.userId));
  }

  // In-app notification
  await db.insert(notificationsTable).values({
    userId: transaction.userId,
    type: "withdrawal_transferred",
    title: "Payment transferred!",
    message: `Your withdrawal of $${(withdrawAmount / 100).toFixed(2)} has been sent to your account. Please allow 1–3 business days for funds to arrive.`,
    relatedId: transaction.id,
  }).catch(err => console.error("[withdrawal] Failed to insert transfer notification:", err));

  // Push notification — fire-and-forget
  pushBonusReceived(
    transaction.userId,
    `$${(withdrawAmount / 100).toFixed(2)} has been transferred to your account!`,
    `withdrawal_transferred_${transaction.id}`,
  ).catch(err => console.error("[push] withdrawal transferred error:", err));

  res.json(updated);
});

router.post("/admin/withdrawals/:id/reject", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const id = parseId(req.params.id);

  const [transaction] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!transaction) { res.status(404).json({ error: "Withdrawal not found" }); return; }
  if (transaction.status !== "pending") {
    res.status(400).json({ error: "Withdrawal already processed" });
    return;
  }

  await db.update(transactionsTable)
    .set({ status: "rejected" })
    .where(eq(transactionsTable.id, id));

  // Refund the amount back to user's balance
  const refundAmount = Math.abs(transaction.amountCents);
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, transaction.userId));
  if (wallet) {
    await db.update(walletsTable)
      .set({ balanceCents: wallet.balanceCents + refundAmount })
      .where(eq(walletsTable.userId, transaction.userId));

    await db.insert(transactionsTable).values({
      userId: transaction.userId,
      type: "earning",
      amountCents: refundAmount,
      description: "Withdrawal rejected — funds returned to balance",
      status: "completed",
    });
  }

  // In-app notification
  await db.insert(notificationsTable).values({
    userId: transaction.userId,
    type: "withdrawal_rejected",
    title: "Withdrawal request not approved",
    message: `Your withdrawal request of $${(refundAmount / 100).toFixed(2)} was not approved. The full amount has been returned to your wallet balance. Contact support if you have questions.`,
    relatedId: transaction.id,
  }).catch(err => console.error("[withdrawal] Failed to insert rejection notification:", err));

  // Email notification — fire-and-forget
  const [userRow] = await db.select().from(usersTable).where(eq(usersTable.clerkId, transaction.userId));
  if (userRow?.email) {
    const mail = withdrawalRejectedEmail({ name: userRow.name, amountCents: refundAmount });
    sendEmail({ to: userRow.email, subject: mail.subject, html: mail.html, text: mail.text })
      .then(ok => {
        if (ok) console.info(`[email] Withdrawal rejection email sent to ${userRow.email}`);
        else console.warn(`[email] Withdrawal rejection email failed for ${userRow.email}`);
      })
      .catch(err => console.error("[email] Withdrawal rejection email error:", err));
  }

  res.json({ success: true, refundedCents: refundAmount });
});

// ── Admin Flag Management ──────────────────────────────────────────────────

// GET /admin/flags — list all flagged answers with counts and user info
router.get("/admin/flags", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  // Get all answers that have been flagged (any flag status)
  const flaggedAnswers = await db
    .select({
      answerId: answersTable.id,
      answerText: answersTable.answerText,
      flagStatus: answersTable.flagStatus,
      userId: answersTable.userId,
      questionId: answersTable.questionId,
      userName: usersTable.name,
      questionTitle: questionsTable.title,
    })
    .from(answersTable)
    .leftJoin(usersTable, eq(usersTable.clerkId, answersTable.userId))
    .leftJoin(questionsTable, eq(questionsTable.id, answersTable.questionId))
    .where(drizzleSql`${answersTable.flagStatus} IS NOT NULL`)
    .orderBy(desc(answersTable.id));

  // For each flagged answer, get the flag details
  const answerIds = flaggedAnswers.map(a => a.answerId);
  let flagDetails: any[] = [];
  if (answerIds.length > 0) {
    flagDetails = await db
      .select({
        id: answerFlagsTable.id,
        answerId: answerFlagsTable.answerId,
        reason: answerFlagsTable.reason,
        status: answerFlagsTable.status,
        flaggedByUserId: answerFlagsTable.flaggedByUserId,
        createdAt: answerFlagsTable.createdAt,
      })
      .from(answerFlagsTable)
      .where(inArray(answerFlagsTable.answerId, answerIds))
      .orderBy(desc(answerFlagsTable.createdAt));
  }

  // Group flags by answerId
  const flagsByAnswer: Record<number, any[]> = {};
  for (const flag of flagDetails) {
    if (!flagsByAnswer[flag.answerId]) flagsByAnswer[flag.answerId] = [];
    flagsByAnswer[flag.answerId].push(flag);
  }

  const items = flaggedAnswers.map(a => ({
    answerId: a.answerId,
    answerText: a.answerText,
    flagStatus: a.flagStatus,
    userId: a.userId,
    userName: a.userName || "Anonymous",
    questionId: a.questionId,
    questionTitle: a.questionTitle,
    flags: flagsByAnswer[a.answerId] ?? [],
    flagCount: (flagsByAnswer[a.answerId] ?? []).length,
    topReason: (flagsByAnswer[a.answerId] ?? [])[0]?.reason ?? "Unknown",
  }));

  const pending = items.filter(i => i.flagStatus === "pending").length;
  const resolved = items.filter(i => i.flagStatus === "resolved").length;
  const removed = items.filter(i => i.flagStatus === "removed").length;

  res.json({ items, total: items.length, pending, resolved, removed });
});

// DELETE /admin/answers/:id — remove a flagged answer (marks as removed, decrements count)
router.delete("/admin/answers/:id", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const answerId = parseId(req.params.id);
  if (!answerId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [answer] = await db.select().from(answersTable).where(eq(answersTable.id, answerId));
  if (!answer) { res.status(404).json({ error: "Answer not found" }); return; }

  await db.update(answersTable).set({ flagStatus: "removed" }).where(eq(answersTable.id, answerId));
  await db.update(answerFlagsTable)
    .set({ status: "removed" })
    .where(eq(answerFlagsTable.answerId, answerId));

  // Decrement question total answers
  await db.update(questionsTable)
    .set({ totalAnswers: drizzleSql`GREATEST(0, ${questionsTable.totalAnswers} - 1)` })
    .where(eq(questionsTable.id, answer.questionId));

  res.json({ success: true });
});

// POST /admin/flags/:id/ignore — ignore a specific flag record
router.post("/admin/flags/:id/ignore", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const flagId = parseId(req.params.id);
  if (!flagId) { res.status(400).json({ error: "Invalid id" }); return; }

  const [flag] = await db.select().from(answerFlagsTable).where(eq(answerFlagsTable.id, flagId));
  if (!flag) { res.status(404).json({ error: "Flag not found" }); return; }

  await db.update(answerFlagsTable).set({ status: "ignored" }).where(eq(answerFlagsTable.id, flagId));

  // If all flags on this answer are now ignored/resolved, clear the answer flag status
  const remainingPending = await db
    .select({ cnt: count() })
    .from(answerFlagsTable)
    .where(and(eq(answerFlagsTable.answerId, flag.answerId), eq(answerFlagsTable.status, "pending")));
  if (Number(remainingPending[0]?.cnt ?? 0) === 0) {
    await db.update(answersTable).set({ flagStatus: null }).where(eq(answersTable.id, flag.answerId));
  }

  res.json({ success: true });
});

// POST /admin/answers/:id/clear-flag — clear all flags on an answer
router.post("/admin/answers/:id/clear-flag", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const answerId = parseId(req.params.id);
  if (!answerId) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(answersTable).set({ flagStatus: null }).where(eq(answersTable.id, answerId));
  await db.update(answerFlagsTable)
    .set({ status: "ignored" })
    .where(and(eq(answerFlagsTable.answerId, answerId), eq(answerFlagsTable.status, "pending")));

  res.json({ success: true });
});

// ── Push notification admin endpoints ─────────────────────────────────────────

// GET /admin/push/config — view current push notification configuration
router.get("/admin/push/config", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  res.json({
    config: PUSH_CONFIG,
    keyConfigured: !!process.env.ONESIGNAL_REST_API_KEY,
    envOverrides: {
      PUSH_DAILY_CAP: process.env.PUSH_DAILY_CAP ?? "(default: 3)",
      PUSH_ENABLE_QUESTION_APPROVED:   process.env.PUSH_ENABLE_QUESTION_APPROVED   ?? "(default: true)",
      PUSH_ENABLE_QUESTION_ANSWERED:   process.env.PUSH_ENABLE_QUESTION_ANSWERED   ?? "(default: true)",
      PUSH_ENABLE_INVITATION_ACCEPTED: process.env.PUSH_ENABLE_INVITATION_ACCEPTED ?? "(default: true)",
      PUSH_ENABLE_BONUS_RECEIVED:      process.env.PUSH_ENABLE_BONUS_RECEIVED      ?? "(default: true)",
      PUSH_ENABLE_NEW_QUESTION:        process.env.PUSH_ENABLE_NEW_QUESTION        ?? "(default: true)",
    },
  });
});

// GET /admin/push/logs — recent push notification log (last 200 entries)
router.get("/admin/push/logs", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const logs = await db
    .select()
    .from(pushNotificationLogsTable)
    .orderBy(desc(pushNotificationLogsTable.sentAt))
    .limit(200);
  const summary = {
    total: logs.length,
    byStatus: logs.reduce<Record<string, number>>((acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    }, {}),
    byType: logs.reduce<Record<string, number>>((acc, l) => {
      acc[l.type] = (acc[l.type] ?? 0) + 1;
      return acc;
    }, {}),
  };
  res.json({ summary, logs });
});

export default router;
