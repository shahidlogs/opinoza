import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, questionsTable, usersTable, transactionsTable, answersTable, walletsTable, notificationsTable, answerFlagsTable, pushNotificationLogsTable, bannedIpsTable } from "@workspace/db";
import { sendEmail, sendEmailDirect, withdrawalApprovedEmail, withdrawalRejectedEmail, questionRejectedEmail, paymentTransferredEmail } from "../lib/email.js";
import { pushQuestionApproved, pushBonusReceived, PUSH_CONFIG } from "../lib/push.js";
import { cleanupRejectedAnswers } from "../lib/cleanup-rejected-answers.js";
import { eq, count, sum, and, gte, desc, inArray, sql as drizzleSql } from "drizzle-orm";
import { notifCacheInvalidate } from "../lib/notifCache";

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

// Checks that the caller is either an Admin or an Editor.
// Returns the resolved user record, or null (and sends 401/403) on failure.
// Only grant Editor access to routes that Editors are explicitly permitted to use:
//   - GET  /admin/questions   (list questions for moderation)
//   - POST /admin/questions/:id/approve
//   - POST /admin/questions/:id/reject
// All other admin routes remain admin-only.
async function checkAdminOrEditor(req: any, res: any): Promise<{ userId: string; isAdmin: boolean; isEditor: boolean } | null> {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!user?.isAdmin && !user?.isEditor) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return { userId: auth.userId, isAdmin: !!user.isAdmin, isEditor: !!user.isEditor };
}

function parseId(raw: string | string[]): number {
  const str = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(str, 10);
}

// Lightweight badge counts — called on admin panel mount to show tab badges without loading full lists
router.get("/admin/counts", async (req, res): Promise<void> => {
  if (!await checkAdminOrEditor(req, res)) return;

  const result = await db.execute(drizzleSql`
    SELECT
      (SELECT COUNT(*)::int FROM questions WHERE status = 'pending')                                                             AS pending_questions,
      (SELECT COUNT(*)::int FROM transactions WHERE type = 'withdrawal' AND status IN ('pending','approved','completed'))        AS pending_withdrawals,
      (SELECT COUNT(*)::int FROM users WHERE verification_status IN ('pending','reupload_requested'))                            AS pending_verifications,
      (SELECT COUNT(DISTINCT answer_id)::int FROM answer_flags WHERE status = 'pending')                                        AS pending_flags
  `);
  const rows: any[] = Array.isArray(result) ? result : (result as any).rows ?? [];
  const row = rows[0] ?? {};
  res.json({
    pendingQuestions:    Number(row.pending_questions    ?? 0),
    pendingWithdrawals:  Number(row.pending_withdrawals  ?? 0),
    pendingVerifications:Number(row.pending_verifications?? 0),
    pendingFlags:        Number(row.pending_flags        ?? 0),
  });
});

// List questions with optional status filter — accessible by Admin OR Editor
// Supports ?page=1&limit=25 pagination. Omit limit (or limit=0) to return all (legacy).
router.get("/admin/questions", async (req, res): Promise<void> => {
  if (!await checkAdminOrEditor(req, res)) return;

  const { status } = req.query as Record<string, string>;
  const page  = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
  const limit = Math.min(200, Math.max(0, parseInt((req.query.limit as string) || "0", 10)));
  const offset = (page - 1) * limit;

  let baseQuery = db.select().from(questionsTable).$dynamic();
  if (status) baseQuery = baseQuery.where(eq(questionsTable.status, status));
  baseQuery = baseQuery.orderBy(desc(questionsTable.createdAt));

  if (limit > 0) baseQuery = baseQuery.limit(limit).offset(offset);
  const questions = await baseQuery;

  let total = questions.length;
  let hasMore = false;
  if (limit > 0) {
    let cq = db.select({ cnt: count() }).from(questionsTable).$dynamic();
    if (status) cq = cq.where(eq(questionsTable.status, status));
    const [{ cnt }] = await cq;
    total = Number(cnt);
    hasMore = offset + questions.length < total;
  }
  res.json({ questions, total, hasMore });
});

// Approve question — accessible by Admin OR Editor
router.post("/admin/questions/:id/approve", async (req, res): Promise<void> => {
  if (!await checkAdminOrEditor(req, res)) return;
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
    notifCacheInvalidate(question.creatorId);
    // Push notification — fire-and-forget (question approved email is disabled)
    pushQuestionApproved(question.creatorId!, question.title, question.id)
      .catch(err => console.error("[push] question_approved error:", err));
  }

  res.json(question);
});

// Reject question (with optional refund) — accessible by Admin OR Editor
const REJECTION_REASONS = [
  "Not an opinion, preference, habit, or behavior-based question",
  "Not a short-answer question",
  "Unclear or confusing meaning",
  "Grammar or spelling mistakes",
  "Missing or weak description",
  "Duplicate or very similar question",
  "Not suitable for our platform",
] as const;

router.post("/admin/questions/:id/reject", async (req, res): Promise<void> => {
  const caller = await checkAdminOrEditor(req, res);
  if (!caller) return;
  const adminId = caller.userId;
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

  // Refund 20 cents to creator if question was pending (5 cents kept as penalty from the 25¢ submission cost)
  const QUESTION_REFUND_CENTS = 20;
  const QUESTION_PENALTY_CENTS = 5;
  if (question.status === "pending" && question.creatorId) {
    // Atomic SQL increment — race-safe; runs in parallel with the transaction INSERT
    const [refundedWallet] = await db.update(walletsTable)
      .set({ balanceCents: drizzleSql`balance_cents + ${QUESTION_REFUND_CENTS}` })
      .where(eq(walletsTable.userId, question.creatorId))
      .returning({ balanceCents: walletsTable.balanceCents });
    if (refundedWallet) {
      await db.insert(transactionsTable).values({
        userId: question.creatorId,
        type: "question_rejection_refund",
        amountCents: QUESTION_REFUND_CENTS,
        description: `Question rejection refund: "${question.title.substring(0, 50)}" (${QUESTION_PENALTY_CENTS}¢ penalty retained)`,
        status: "completed",
        relatedId: id,
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
    const refundNote = wasRefunded
      ? "\n\n20¢ has been refunded to your wallet. 5¢ was kept as a processing penalty."
      : "";
    await db.insert(notificationsTable).values({
      userId: question.creatorId,
      type: "question_rejected",
      title: "Question rejected",
      message: `Your question was rejected because it appears to be spam, low-quality, unclear, duplicate, or against platform rules.\nReason: ${rejectionReason}${refundNote}`,
      relatedId: id,
    });
    notifCacheInvalidate(question.creatorId);
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
    notifCacheInvalidate(question.creatorId);
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

// List users with per-user stats. Supports ?page=1&limit=50&search=&sort=
// sort values: newest|oldest|earnings-desc|earnings-asc|answers-desc|answers-asc|questions-desc|questions-asc|balance-desc|banned|verified
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const page   = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
  const limit  = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || "50", 10)));
  const search = ((req.query.search as string) || "").trim().toLowerCase();
  const sort   = ((req.query.sort   as string) || "newest").trim();
  const offset = (page - 1) * limit;

  // ORDER BY clause (whitelist — no injection risk).
  // References computed CTE column names (no table prefix — u alias not in outer scope).
  const ORDER_CLAUSES: Record<string, string> = {
    "newest":         "created_at DESC",
    "oldest":         "created_at ASC",
    "earnings-desc":  "earnings_cents DESC NULLS LAST, created_at DESC",
    "earnings-asc":   "earnings_cents ASC  NULLS LAST, created_at DESC",
    "answers-desc":   "answer_count  DESC NULLS LAST, created_at DESC",
    "answers-asc":    "answer_count  ASC  NULLS LAST, created_at DESC",
    "questions-desc": "question_count DESC NULLS LAST, created_at DESC",
    "questions-asc":  "question_count ASC  NULLS LAST, created_at DESC",
    "balance-desc":   "balance_cents DESC NULLS LAST, created_at DESC",
    "banned":         "created_at DESC",
    "verified":       "created_at DESC",
  };
  const orderClause = ORDER_CLAUSES[sort] ?? "created_at DESC";

  // Conditional WHERE fragments (composed as sql template literals so values are parameterized)
  const searchCond = search
    ? drizzleSql`AND (LOWER(u.name) LIKE ${`%${search}%`} OR LOWER(u.email) LIKE ${`%${search}%`})`
    : drizzleSql``;
  const bannedCond  = sort === "banned"   ? drizzleSql`AND u.is_banned = true`                    : drizzleSql``;
  const verifCond   = sort === "verified" ? drizzleSql`AND u.verification_status = 'approved'`     : drizzleSql``;

  // Single CTE: compute aggregates for ALL matching users, sort, then paginate.
  // u.* is safe here; computed cols have distinct names so no collisions.
  const raw = await db.execute(drizzleSql`
    WITH agg AS (
      SELECT
        u.*,
        COALESCE(q.qc,  0)::int    AS question_count,
        COALESCE(a.ac,  0)::int    AS answer_count,
        COALESCE(e.ec,  0)::bigint AS earnings_cents,
        COALESCE(w.balance_cents, 0)::bigint AS balance_cents
      FROM users u
      LEFT JOIN (
        SELECT creator_id, COUNT(*)::int AS qc FROM questions GROUP BY creator_id
      ) q ON q.creator_id = u.clerk_id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS ac FROM answers GROUP BY user_id
      ) a ON a.user_id = u.clerk_id
      LEFT JOIN (
        SELECT user_id, COALESCE(SUM(amount_cents), 0)::bigint AS ec
        FROM transactions
        WHERE type IN ('earning', 'profile_reward', 'creator_reward')
        GROUP BY user_id
      ) e ON e.user_id = u.clerk_id
      LEFT JOIN wallets w ON w.user_id = u.clerk_id
      WHERE 1=1 ${searchCond} ${bannedCond} ${verifCond}
    ),
    total_cte AS (SELECT COUNT(*)::int AS cnt FROM agg)
    SELECT agg.*, total_cte.cnt AS __total__
    FROM agg
    CROSS JOIN total_cte
    ORDER BY ${drizzleSql.raw(orderClause)}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows: any[] = Array.isArray(raw) ? raw : (raw as any).rows ?? [];
  const total   = rows.length > 0 ? Number(rows[0].__total__ ?? 0) : 0;
  const hasMore = offset + rows.length < total;

  const users = rows.map(r => ({
    clerkId:                     r.clerk_id,
    name:                        r.name,
    email:                       r.email,
    isAdmin:                     r.is_admin,
    isEditor:                    r.is_editor,
    isBanned:                    r.is_banned,
    bannedReason:                r.banned_reason,
    bannedAt:                    r.banned_at,
    bannedBy:                    r.banned_by,
    verificationStatus:          r.verification_status,
    verificationRejectionReason: r.verification_rejection_reason,
    verifiedName:                r.verified_name,
    createdAt:                   r.created_at,
    updatedAt:                   r.updated_at,
    referralCode:                r.referral_code,
    referredByUserId:            r.referred_by_user_id,
    city:                        r.city,
    ageGroup:                    r.age_group,
    gender:                      r.gender,
    phoneNumber:                 r.phone_number,
    signupIp:                    r.signup_ip,
    lastIp:                      r.last_ip,
    nameLocked:                  r.name_locked,
    questionCount:  Number(r.question_count ?? 0),
    answerCount:    Number(r.answer_count   ?? 0),
    earningsCents:  Number(r.earnings_cents ?? 0),
    balanceCents:   Number(r.balance_cents  ?? 0),
  }));

  res.json({ users, total, hasMore });
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

// Detailed per-user earnings breakdown (server-side, from transactions table)
router.get("/admin/users/:id/earnings", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const clerkId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  // Earnings per transaction type (positive amounts only)
  const txRows = await db.execute(drizzleSql`
    SELECT type, COALESCE(SUM(amount_cents), 0)::float AS total_cents
    FROM transactions
    WHERE user_id = ${clerkId}
      AND amount_cents > 0
    GROUP BY type
  `);
  const rows: any[] = Array.isArray(txRows) ? txRows : (txRows as any).rows ?? [];
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type] = Number(r.total_cents ?? 0);

  const answerEarningsCents  = (byType["earning"] ?? 0) + (byType["profile_reward"] ?? 0) + (byType["creator_reward"] ?? 0);
  const referralSignupCents  = byType["referral_signup_bonus"] ?? 0;
  const referralAnswerCents  = byType["referral_answer_bonus"] ?? 0;
  const totalReferralCents   = referralSignupCents + referralAnswerCents;
  const totalEarnedCents     = Object.values(byType).reduce((s, v) => s + v, 0);

  // Current wallet balance
  const [wallet] = await db
    .select({ balanceCents: walletsTable.balanceCents })
    .from(walletsTable)
    .where(eq(walletsTable.userId, clerkId));
  const currentBalanceCents = wallet?.balanceCents ?? 0;

  // Referral stats: invited count, active (≥1 answer), total answers from referred users
  const referralStatsRows = await db.execute(drizzleSql`
    SELECT
      COUNT(DISTINCT u.id)                                               AS invited_users,
      COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN u.id END)          AS active_referred_users,
      COUNT(a.id)                                                        AS referred_answers
    FROM users u
    LEFT JOIN answers a ON a.user_id = u.clerk_id
    WHERE u.referred_by_user_id = ${clerkId}
  `);
  const sRows: any[] = Array.isArray(referralStatsRows) ? referralStatsRows : (referralStatsRows as any).rows ?? [];
  const invitedUsers        = Number(sRows[0]?.invited_users       ?? 0);
  const activeReferredUsers = Number(sRows[0]?.active_referred_users ?? 0);
  const referredAnswers     = Number(sRows[0]?.referred_answers     ?? 0);

  res.json({
    answerEarningsCents,
    referralSignupCents,
    referralAnswerCents,
    totalReferralCents,
    totalEarnedCents,
    currentBalanceCents,
    invitedUsers,
    activeReferredUsers,
    referredAnswers,
  });
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

// Toggle Editor role (Admin-only — only admins can assign/remove Editor)
// Safety: cannot assign Editor to an existing Admin (they already have full powers).
// Cannot assign Editor to yourself.
router.patch("/admin/users/:id/toggle-editor", async (req, res): Promise<void> => {
  const callerId = await checkAdmin(req, res);
  if (!callerId) return;

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, raw));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user.isAdmin) {
    res.status(400).json({ error: "Cannot assign Editor role to an Admin user" });
    return;
  }

  const [updated] = await db.update(usersTable)
    .set({ isEditor: !user.isEditor })
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

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // All 7 stats queries are independent — run them in parallel for a ~6x speedup.
  const [
    [userCount],
    [questionCount],
    [pendingCount],
    [answerCount],
    earnedResult,
    withdrawnResult,
    pendingWithdrawalResult,
    activeUsersResult,
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(questionsTable),
    db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.status, "pending")),
    db.select({ count: count() }).from(answersTable)
      .where(drizzleSql`(${answersTable.flagStatus} IS NULL OR ${answersTable.flagStatus} != 'removed')`),

    // Total earned = all genuine platform payouts to users (positive transactions only).
    db.execute(drizzleSql`
      SELECT COALESCE(SUM(amount_cents), 0)::float AS total
      FROM transactions
      WHERE type IN ('earning', 'creator_reward', 'profile_reward', 'referral_signup_bonus', 'referral_answer_bonus')
        AND amount_cents > 0
    `),

    // "Withdrawn" = only truly transferred (admin clicked Transfer)
    db.select({ total: sum(transactionsTable.amountCents) })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "withdrawal"),
        eq(transactionsTable.status, "transferred"),
      )),

    // "Pending" = not yet paid (pending + approved + legacy completed)
    db.select({ total: sum(transactionsTable.amountCents) })
      .from(transactionsTable)
      .where(and(
        eq(transactionsTable.type, "withdrawal"),
        inArray(transactionsTable.status, ["pending", "approved", "completed"]),
      )),

    // Active users this week = DISTINCT users with ≥1 answer in last 7 days
    db.execute(drizzleSql`
      SELECT COUNT(DISTINCT user_id)::int AS cnt
      FROM answers
      WHERE created_at >= ${weekAgo}
        AND (flag_status IS NULL OR flag_status != 'removed')
    `),
  ]);

  const earnedRows: any[] = Array.isArray(earnedResult) ? earnedResult : (earnedResult as any).rows ?? [];
  const totalEarnedCents = Number(earnedRows[0]?.total ?? 0);
  const totalWithdrawnCents = Math.abs(Number(withdrawnResult[0]?.total ?? 0));
  const pendingWithdrawalCents = Math.abs(Number(pendingWithdrawalResult[0]?.total ?? 0));
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

// Withdrawal management. Supports ?page=1&limit=25
router.get("/admin/withdrawals", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const page  = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
  const limit = Math.min(200, Math.max(0, parseInt((req.query.limit as string) || "0", 10)));
  const offset = (page - 1) * limit;

  const baseFields = {
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
  };

  let q = db.select(baseFields)
    .from(transactionsTable)
    .leftJoin(usersTable, eq(usersTable.clerkId, transactionsTable.userId))
    .where(eq(transactionsTable.type, "withdrawal"))
    .orderBy(desc(transactionsTable.createdAt))
    .$dynamic();

  let total = 0;
  let hasMore = false;

  if (limit > 0) {
    const [{ cnt }] = await db.select({ cnt: count() })
      .from(transactionsTable)
      .where(eq(transactionsTable.type, "withdrawal"));
    total = Number(cnt);
    hasMore = offset + limit < total;
    q = q.limit(limit).offset(offset);
  }

  const rows = await q;
  if (!limit) total = rows.length;

  res.json({ transactions: rows, total, hasMore });
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
    title: "Withdrawal approved",
    message: "Your withdrawal request has been approved. Payment will be transferred within 7 working days.",
    relatedId: transaction.id,
  }).then(() => notifCacheInvalidate(transaction.userId))
    .catch(err => console.error("[withdrawal] Failed to insert notification:", err));

  // Push — fire-and-forget (no email)
  pushBonusReceived(
    transaction.userId,
    "Your withdrawal request has been approved. Payment will be transferred within 7 working days.",
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
  if (transaction.status === "transferred") {
    res.status(409).json({ error: "Withdrawal has already been marked as transferred" });
    return;
  }
  if (transaction.status !== "approved" && transaction.status !== "completed") {
    res.status(400).json({ error: "Withdrawal must be approved before marking as transferred" });
    return;
  }

  const now = new Date();
  // Atomic update — only succeeds if the row is still in approved/completed state.
  // This prevents double-counting if two requests race after both reading "approved".
  const [updated] = await db.update(transactionsTable)
    .set({ status: "transferred", transferredAt: now })
    .where(
      and(
        eq(transactionsTable.id, id),
        inArray(transactionsTable.status, ["approved", "completed"]),
      )
    )
    .returning();

  if (!updated) {
    res.status(409).json({ error: "Withdrawal was already transferred by a concurrent request" });
    return;
  }

  // Update wallet's totalWithdrawnCents — payment has actually been sent.
  // Only runs if the atomic update above succeeded, preventing double-increments.
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
    title: "Payment transferred",
    message: "Your payment has been successfully transferred.",
    relatedId: transaction.id,
  }).then(() => notifCacheInvalidate(transaction.userId))
    .catch(err => console.error("[withdrawal] Failed to insert transfer notification:", err));

  // Push notification — fire-and-forget
  pushBonusReceived(
    transaction.userId,
    "Your payment has been successfully transferred.",
    `withdrawal_transferred_${transaction.id}`,
  ).catch(err => console.error("[push] withdrawal transferred error:", err));

  // ── Payment confirmation email ────────────────────────────────────────────
  let emailSent = false;
  if (!updated.paymentEmailSentAt) {
    try {
      const [userRow] = await db
        .select({ email: usersTable.email, name: usersTable.name, referralCode: usersTable.referralCode })
        .from(usersTable)
        .where(eq(usersTable.clerkId, transaction.userId));

      if (userRow?.email) {
        // Parse payment method from description: "Withdrawal via METHOD — ..."
        const descMatch = (transaction.description || "").match(/^Withdrawal via (.+?) —/);
        const paymentMethod = descMatch ? descMatch[1] : "Bank Transfer";

        const mail = paymentTransferredEmail({
          name: userRow.name,
          amountCents: Math.abs(transaction.amountCents),
          paymentMethod,
          referralCode: userRow.referralCode,
        });

        const paymentImgPath = new URL("../public/payment.png", import.meta.url).pathname;

        emailSent = await sendEmailDirect({
          to: userRow.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          attachments: [{ filename: "payment.png", path: paymentImgPath, contentType: "image/png" }],
        });

        if (emailSent) {
          await db.update(transactionsTable)
            .set({ paymentEmailSentAt: new Date() })
            .where(eq(transactionsTable.id, transaction.id))
            .catch(err => console.error("[withdrawal] Failed to set paymentEmailSentAt:", err));
        }
      }
    } catch (err) {
      console.error("[withdrawal] Payment confirmation email error:", err);
    }
  } else {
    console.info(`[withdrawal] Payment email already sent for tx ${transaction.id} — skipping`);
  }

  res.json({ ...updated, emailSent });
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

  // Refund the amount back to user's balance — atomic SQL increment (race-safe)
  const refundAmount = Math.abs(transaction.amountCents);
  const [refunded] = await db.update(walletsTable)
    .set({ balanceCents: drizzleSql`balance_cents + ${refundAmount}` })
    .where(eq(walletsTable.userId, transaction.userId))
    .returning({ balanceCents: walletsTable.balanceCents });

  if (refunded) {
    await db.insert(transactionsTable).values({
      userId: transaction.userId,
      type: "withdrawal_refund",
      amountCents: refundAmount,
      description: "Withdrawal rejected — funds returned to balance",
      status: "completed",
      relatedId: id,
    });
  }

  // In-app notification
  await db.insert(notificationsTable).values({
    userId: transaction.userId,
    type: "withdrawal_rejected",
    title: "Withdrawal request not approved",
    message: `Your withdrawal request of $${(refundAmount / 100).toFixed(2)} was not approved. The full amount has been returned to your wallet balance. Contact support if you have questions.`,
    relatedId: transaction.id,
  }).then(() => notifCacheInvalidate(transaction.userId))
    .catch(err => console.error("[withdrawal] Failed to insert rejection notification:", err));

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
// Supports ?page=1&limit=25&status=pending|resolved|removed (status filters displayed items, counts are always global)
router.get("/admin/flags", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const page   = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
  const limit  = Math.min(200, Math.max(0, parseInt((req.query.limit as string) || "0", 10)));
  const offset = (page - 1) * limit;
  const statusFilter = (req.query.status as string) || null;

  // Get counts (always global, not filtered by status)
  const [{ pending }, { resolved }, { removed }] = await Promise.all([
    db.select({ pending: count() }).from(answersTable).where(eq(answersTable.flagStatus, "pending")).then(r => ({ pending: Number(r[0]?.pending ?? 0) })),
    db.select({ resolved: count() }).from(answersTable).where(eq(answersTable.flagStatus, "resolved")).then(r => ({ resolved: Number(r[0]?.resolved ?? 0) })),
    db.select({ removed: count() }).from(answersTable).where(eq(answersTable.flagStatus, "removed")).then(r => ({ removed: Number(r[0]?.removed ?? 0) })),
  ]);
  const totalCount = pending + resolved + removed;

  // Get paged flagged answers
  let answerQ = db
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
    .where(statusFilter
      ? eq(answersTable.flagStatus, statusFilter)
      : drizzleSql`${answersTable.flagStatus} IS NOT NULL`)
    .orderBy(desc(answersTable.id))
    .$dynamic();

  if (limit > 0) answerQ = answerQ.limit(limit).offset(offset);
  const flaggedAnswers = await answerQ;

  let flagDetails: any[] = [];
  if (flaggedAnswers.length > 0) {
    const answerIds = flaggedAnswers.map(a => a.answerId);
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

  const displayedTotal = statusFilter
    ? (statusFilter === "pending" ? pending : statusFilter === "resolved" ? resolved : removed)
    : totalCount;
  const hasMore = limit > 0 ? offset + items.length < displayedTotal : false;

  res.json({ items, total: displayedTotal, hasMore, pending, resolved, removed });
});

// DELETE /admin/answers/:id — remove a flagged answer (marks as removed, decrements count)
// Also applies a $0.10 penalty to the answer owner's wallet (idempotent — one penalty per answer).
router.delete("/admin/answers/:id", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;
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

  // ── Penalty: $0.10 deducted from answer owner's wallet ───────────────────
  const PENALTY_CENTS = 10;
  let penaltyApplied = false;
  let penaltyAmount = 0;
  let fullPenalty = false;

  // Idempotency guard — never penalise the same answer twice
  const [existingPenalty] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "answer_removed_penalty"),
      eq(transactionsTable.relatedId, answerId),
    ));

  if (!existingPenalty) {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, answer.userId));
    const currentBalance = wallet?.balanceCents ?? 0;
    const deduction = Math.min(currentBalance, PENALTY_CENTS);

    // Atomically deduct (never go below zero)
    if (deduction > 0) {
      await db.update(walletsTable)
        .set({ balanceCents: drizzleSql`GREATEST(0, balance_cents - ${deduction})` })
        .where(eq(walletsTable.userId, answer.userId));
    }

    // Always record a transaction even if balance was 0 (for audit trail)
    await db.insert(transactionsTable).values({
      userId: answer.userId,
      type: "answer_removed_penalty",
      amountCents: -deduction,
      description: "Penalty for removed flagged answer",
      status: "completed",
      relatedId: answerId,
      meta: { answerId, adminId },
    });

    // In-app notification (fire-and-forget, don't block response)
    db.insert(notificationsTable).values({
      userId: answer.userId,
      type: "answer_removed_penalty",
      title: "Answer removed penalty",
      message: "Your flagged answer was removed after admin review. A $0.10 penalty has been deducted from your wallet according to Opinoza community rules.",
      relatedId: answerId,
    }).then(() => notifCacheInvalidate(answer.userId))
      .catch(err => console.error("[penalty] Failed to insert notification:", err));

    // Push notification (fire-and-forget)
    pushBonusReceived(
      answer.userId,
      "Your flagged answer was removed after admin review. A $0.10 penalty has been deducted from your wallet.",
      `answer_removed_penalty_${answerId}`,
    ).catch(err => console.error("[push] penalty notification error:", err));

    penaltyApplied = true;
    penaltyAmount = deduction;
    fullPenalty = deduction >= PENALTY_CENTS;
    console.log(`[penalty] Removed answer ${answerId} by ${answer.userId} — deducted ${deduction}¢ (admin: ${adminId})`);
  } else {
    console.log(`[penalty] Skipped duplicate penalty for answer ${answerId}`);
  }

  res.json({ success: true, penaltyApplied, penaltyAmount, fullPenalty });
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

// POST /admin/flags/bulk-clear — clear flags on multiple answers at once
router.post("/admin/flags/bulk-clear", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const { answerIds } = req.body as { answerIds: number[] };
  if (!Array.isArray(answerIds) || answerIds.length === 0) {
    res.status(400).json({ error: "answerIds must be a non-empty array" }); return;
  }
  await db.update(answersTable).set({ flagStatus: null }).where(inArray(answersTable.id, answerIds));
  await db.update(answerFlagsTable)
    .set({ status: "ignored" })
    .where(and(inArray(answerFlagsTable.answerId, answerIds), eq(answerFlagsTable.status, "pending")));
  res.json({ success: true, processed: answerIds.length });
});

// POST /admin/flags/bulk-remove — remove multiple flagged answers at once
// Applies a $0.10 penalty per answer (idempotent per answer).
router.post("/admin/flags/bulk-remove", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;
  const { answerIds } = req.body as { answerIds: number[] };
  if (!Array.isArray(answerIds) || answerIds.length === 0) {
    res.status(400).json({ error: "answerIds must be a non-empty array" }); return;
  }
  const answers = await db
    .select({ id: answersTable.id, questionId: answersTable.questionId, flagStatus: answersTable.flagStatus, userId: answersTable.userId })
    .from(answersTable)
    .where(inArray(answersTable.id, answerIds));
  const toProcess = answers.filter(a => a.flagStatus !== "removed");
  if (toProcess.length === 0) { res.json({ success: true, processed: 0, penaltiesApplied: 0 }); return; }
  const toProcessIds = toProcess.map(a => a.id);
  await db.update(answersTable).set({ flagStatus: "removed" }).where(inArray(answersTable.id, toProcessIds));
  await db.update(answerFlagsTable).set({ status: "removed" }).where(inArray(answerFlagsTable.answerId, toProcessIds));
  const questionGroups: Record<number, number> = {};
  for (const a of toProcess) questionGroups[a.questionId] = (questionGroups[a.questionId] ?? 0) + 1;
  for (const [qId, cnt] of Object.entries(questionGroups)) {
    await db.update(questionsTable)
      .set({ totalAnswers: drizzleSql`GREATEST(0, ${questionsTable.totalAnswers} - ${cnt})` })
      .where(eq(questionsTable.id, Number(qId)));
  }

  // ── Penalties (one per answer, idempotent) ───────────────────────────────
  const PENALTY_CENTS = 10;
  let penaltiesApplied = 0;

  // Check which answers already have a penalty transaction
  const existingPenalties = await db
    .select({ relatedId: transactionsTable.relatedId })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.type, "answer_removed_penalty"),
      inArray(transactionsTable.relatedId as any, toProcessIds),
    ));
  const alreadyPenalised = new Set(existingPenalties.map(r => r.relatedId));

  for (const answer of toProcess) {
    if (alreadyPenalised.has(answer.id)) continue;
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, answer.userId));
    const currentBalance = wallet?.balanceCents ?? 0;
    const deduction = Math.min(currentBalance, PENALTY_CENTS);
    if (deduction > 0) {
      await db.update(walletsTable)
        .set({ balanceCents: drizzleSql`GREATEST(0, balance_cents - ${deduction})` })
        .where(eq(walletsTable.userId, answer.userId));
    }
    await db.insert(transactionsTable).values({
      userId: answer.userId,
      type: "answer_removed_penalty",
      amountCents: -deduction,
      description: "Penalty for removed flagged answer",
      status: "completed",
      relatedId: answer.id,
      meta: { answerId: answer.id, adminId },
    });
    db.insert(notificationsTable).values({
      userId: answer.userId,
      type: "answer_removed_penalty",
      title: "Answer removed penalty",
      message: "Your flagged answer was removed after admin review. A $0.10 penalty has been deducted from your wallet according to Opinoza community rules.",
      relatedId: answer.id,
    }).then(() => notifCacheInvalidate(answer.userId))
      .catch(err => console.error("[penalty] bulk notify error:", err));
    pushBonusReceived(
      answer.userId,
      "Your flagged answer was removed after admin review. A $0.10 penalty has been deducted from your wallet.",
      `answer_removed_penalty_${answer.id}`,
    ).catch(err => console.error("[push] bulk penalty error:", err));
    penaltiesApplied++;
    console.log(`[penalty] Bulk removed answer ${answer.id} by ${answer.userId} — deducted ${deduction}¢ (admin: ${adminId})`);
  }

  res.json({ success: true, processed: toProcess.length, penaltiesApplied });
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

// ─── GET /admin/earnings-analytics ──────────────────────────────────────────
// Full earnings analytics with optional date range filter.
// range: "7" | "30" | "90" | "all"  (default: "all")
//
// Transaction type mapping:
//   answer earnings      → type = 'earning'           (1¢ regular, 2¢ profile)
//   creator rewards      → type = 'creator_reward'    (0.5¢ per answer on custom questions)
//   referral signup      → type = 'referral_signup_bonus'
//   referral per-answer  → type = 'referral_answer_bonus'  (includes 5¢ milestone)
//   question purchases   → type = 'question_creation' (negative spend, platform receives)
//   withdrawals          → type = 'withdrawal'        (negative, filtered by status)
router.get("/admin/earnings-analytics", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const rangeParam = String(req.query.range ?? "all");
  const rangeDays: Record<string, number> = { "7": 7, "30": 30, "90": 90 };
  const days = rangeDays[rangeParam];
  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : new Date("2000-01-01");

  // ── 1. Earnings aggregates by type (date-filtered) ──────────────────────
  const earningsAgg = await db.execute(drizzleSql`
    SELECT
      type,
      COUNT(*)::int                          AS tx_count,
      COALESCE(SUM(amount_cents), 0)::float  AS total_cents,
      COUNT(DISTINCT user_id)::int           AS user_count
    FROM transactions
    WHERE amount_cents > 0
      AND created_at >= ${cutoff}
      AND type IN (
        'earning', 'creator_reward', 'profile_reward',
        'referral_signup_bonus', 'referral_answer_bonus'
      )
    GROUP BY type
  `);
  const earningsRows: any[] = Array.isArray(earningsAgg) ? earningsAgg : (earningsAgg as any).rows ?? [];
  const byType = Object.fromEntries(earningsRows.map((r: any) => [r.type, r]));

  const answerEarningsCents    = Number(byType["earning"]?.total_cents ?? 0)
                                + Number(byType["profile_reward"]?.total_cents ?? 0);
  const creatorRewardCents     = Number(byType["creator_reward"]?.total_cents ?? 0);
  const referralSignupCents    = Number(byType["referral_signup_bonus"]?.total_cents ?? 0);
  const referralAnswerCents    = Number(byType["referral_answer_bonus"]?.total_cents ?? 0);
  const totalDistributedCents  = answerEarningsCents + creatorRewardCents + referralSignupCents + referralAnswerCents;

  const answerEarnerCount      = Number(byType["earning"]?.user_count ?? 0)
                                + Number(byType["profile_reward"]?.user_count ?? 0);
  const creatorEarnerCount     = Number(byType["creator_reward"]?.user_count ?? 0);
  const referralSignupEarners  = Number(byType["referral_signup_bonus"]?.user_count ?? 0);
  const referralAnswerEarners  = Number(byType["referral_answer_bonus"]?.user_count ?? 0);

  // Distinct referral earners (union of both referral types)
  const referralEarnerRow = await db.execute(drizzleSql`
    SELECT COUNT(DISTINCT user_id)::int AS cnt
    FROM transactions
    WHERE type IN ('referral_signup_bonus', 'referral_answer_bonus')
      AND amount_cents > 0
      AND created_at >= ${cutoff}
  `);
  const refRows: any[] = Array.isArray(referralEarnerRow) ? referralEarnerRow : (referralEarnerRow as any).rows ?? [];
  const referralEarnerCount = Number(refRows[0]?.cnt ?? 0);

  // ── 2. Question purchase spending (date-filtered) ────────────────────────
  const spendRow = await db.execute(drizzleSql`
    SELECT COALESCE(SUM(ABS(amount_cents)), 0)::float AS total, COUNT(*)::int AS cnt
    FROM transactions
    WHERE type = 'question_creation'
      AND created_at >= ${cutoff}
  `);
  const spendRows: any[] = Array.isArray(spendRow) ? spendRow : (spendRow as any).rows ?? [];
  const questionPurchaseSpendingCents = Number(spendRows[0]?.total ?? 0);
  const questionPurchaseCount         = Number(spendRows[0]?.cnt ?? 0);

  // ── 3. Answer count for the period ──────────────────────────────────────
  const answerCountRow = await db.execute(drizzleSql`
    SELECT COUNT(*)::int AS cnt FROM answers
    WHERE created_at >= ${cutoff}
      AND (flag_status IS NULL OR flag_status != 'removed')
  `);
  const acRows: any[] = Array.isArray(answerCountRow) ? answerCountRow : (answerCountRow as any).rows ?? [];
  const totalAnswerCount = Number(acRows[0]?.cnt ?? 0);

  // ── 4. Withdrawal stats (always all-time current state) ──────────────────
  const withdrawalRow = await db.execute(drizzleSql`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'transferred' THEN ABS(amount_cents) ELSE 0 END), 0)::float AS withdrawn_cents,
      COALESCE(SUM(CASE WHEN status IN ('pending','approved','completed') THEN ABS(amount_cents) ELSE 0 END), 0)::float AS pending_cents,
      COUNT(CASE WHEN status = 'transferred' THEN 1 END)::int AS completed_count,
      COUNT(CASE WHEN status IN ('pending','approved','completed') THEN 1 END)::int AS pending_count,
      CASE WHEN COUNT(CASE WHEN status = 'transferred' THEN 1 END) > 0
           THEN (SUM(CASE WHEN status = 'transferred' THEN ABS(amount_cents) ELSE 0 END)
                 / COUNT(CASE WHEN status = 'transferred' THEN 1 END))::float
           ELSE 0 END AS avg_withdrawal_cents
    FROM transactions
    WHERE type = 'withdrawal'
  `);
  const wRows: any[] = Array.isArray(withdrawalRow) ? withdrawalRow : (withdrawalRow as any).rows ?? [];
  const totalWithdrawnCents      = Number(wRows[0]?.withdrawn_cents ?? 0);
  const pendingWithdrawalCents   = Number(wRows[0]?.pending_cents ?? 0);
  const completedWithdrawalCount = Number(wRows[0]?.completed_count ?? 0);
  const pendingWithdrawalCount   = Number(wRows[0]?.pending_count ?? 0);
  const avgWithdrawalCents       = Number(wRows[0]?.avg_withdrawal_cents ?? 0);

  // ── 5. Wallet balances (always current, no date filter) ─────────────────
  const walletRow = await db.execute(drizzleSql`
    SELECT
      COALESCE(SUM(balance_cents), 0)::float                                                      AS total_balance,
      COALESCE(SUM(CASE WHEN balance_cents >= 1000 THEN balance_cents ELSE 0 END), 0)::float      AS withdrawable,
      COALESCE(SUM(CASE WHEN balance_cents < 1000  THEN balance_cents ELSE 0 END), 0)::float      AS non_withdrawable,
      COUNT(CASE WHEN balance_cents = 0                        THEN 1 END)::int                   AS range_zero,
      COUNT(CASE WHEN balance_cents > 0   AND balance_cents < 100   THEN 1 END)::int              AS range_0_1,
      COUNT(CASE WHEN balance_cents >= 100  AND balance_cents < 500  THEN 1 END)::int             AS range_1_5,
      COUNT(CASE WHEN balance_cents >= 500  AND balance_cents < 1000 THEN 1 END)::int             AS range_5_10,
      COUNT(CASE WHEN balance_cents >= 1000                          THEN 1 END)::int             AS range_10_plus
    FROM wallets
  `);
  const wbRows: any[] = Array.isArray(walletRow) ? walletRow : (walletRow as any).rows ?? [];
  const totalWalletBalanceCents    = Number(wbRows[0]?.total_balance ?? 0);
  const withdrawableBalanceCents   = Number(wbRows[0]?.withdrawable ?? 0);
  const nonWithdrawableBalanceCents = Number(wbRows[0]?.non_withdrawable ?? 0);
  const walletRangeDistribution = [
    { name: "$0",        count: Number(wbRows[0]?.range_zero ?? 0) },
    { name: "$0–$1",     count: Number(wbRows[0]?.range_0_1  ?? 0) },
    { name: "$1–$5",     count: Number(wbRows[0]?.range_1_5  ?? 0) },
    { name: "$5–$10",    count: Number(wbRows[0]?.range_5_10 ?? 0) },
    { name: "$10+",      count: Number(wbRows[0]?.range_10_plus ?? 0) },
  ];

  // ── 6. Top earners (always all-time, no date filter) ────────────────────
  const topEarnersRow = await db.execute(drizzleSql`
    SELECT
      w.user_id,
      u.name,
      u.email,
      w.balance_cents,
      w.total_earned_cents,
      w.total_withdrawn_cents,
      w.balance_cents >= 1000 AS is_withdrawable,
      COALESCE(ans.total, 0)::float  AS answer_cents,
      COALESCE(cr.total, 0)::float   AS creator_cents,
      COALESCE(ref.total, 0)::float  AS referral_cents
    FROM wallets w
    LEFT JOIN users u ON u.clerk_id = w.user_id
    LEFT JOIN (
      SELECT user_id, SUM(amount_cents) AS total FROM transactions
      WHERE type IN ('earning','profile_reward') AND amount_cents > 0
      GROUP BY user_id
    ) ans ON ans.user_id = w.user_id
    LEFT JOIN (
      SELECT user_id, SUM(amount_cents) AS total FROM transactions
      WHERE type = 'creator_reward' AND amount_cents > 0
      GROUP BY user_id
    ) cr ON cr.user_id = w.user_id
    LEFT JOIN (
      SELECT user_id, SUM(amount_cents) AS total FROM transactions
      WHERE type IN ('referral_signup_bonus','referral_answer_bonus') AND amount_cents > 0
      GROUP BY user_id
    ) ref ON ref.user_id = w.user_id
    ORDER BY w.total_earned_cents DESC
    LIMIT 20
  `);
  const teRows: any[] = Array.isArray(topEarnersRow) ? topEarnersRow : (topEarnersRow as any).rows ?? [];
  const topEarners = teRows.map((r: any) => ({
    userId:           r.user_id,
    name:             r.name || "Anonymous",
    email:            r.email || "",
    balanceCents:     Number(r.balance_cents ?? 0),
    totalEarnedCents: Number(r.total_earned_cents ?? 0),
    answerCents:      Number(r.answer_cents ?? 0),
    creatorCents:     Number(r.creator_cents ?? 0),
    referralCents:    Number(r.referral_cents ?? 0),
    isWithdrawable:   Boolean(r.is_withdrawable),
  }));

  // ── 7. Derived metrics ───────────────────────────────────────────────────
  const avgAnswerEarningsPerUser = answerEarnerCount > 0
    ? answerEarningsCents / answerEarnerCount : 0;
  const avgAnswersPerEarner = answerEarnerCount > 0
    ? totalAnswerCount / answerEarnerCount : 0;
  const avgCreatorEarningsPerUser = creatorEarnerCount > 0
    ? creatorRewardCents / creatorEarnerCount : 0;
  const avgReferralEarningsPerEarner = referralEarnerCount > 0
    ? (referralSignupCents + referralAnswerCents) / referralEarnerCount : 0;

  // ── 8. Chart data ────────────────────────────────────────────────────────
  const earningsSourceBreakdown = [
    { name: "Answers",          value: Math.round(answerEarningsCents * 100) / 100 },
    { name: "Creator Rewards",  value: Math.round(creatorRewardCents  * 100) / 100 },
    { name: "Referral Signup",  value: Math.round(referralSignupCents * 100) / 100 },
    { name: "Referral Answers", value: Math.round(referralAnswerCents * 100) / 100 },
  ].filter(d => d.value > 0);

  const withdrawableUserCount = Number(wbRows[0]?.range_10_plus ?? 0);
  const earnerCategoryDistribution = [
    { name: "Answer earners",    count: answerEarnerCount },
    { name: "Creator earners",   count: creatorEarnerCount },
    { name: "Referral earners",  count: referralEarnerCount },
    { name: "Can withdraw",      count: withdrawableUserCount },
  ];

  res.set("Cache-Control", "no-store");
  res.json({
    range: rangeParam,
    // Totals
    totalDistributedCents,
    answerEarningsCents,
    creatorRewardCents,
    referralSignupCents,
    referralAnswerCents,
    questionPurchaseSpendingCents,
    questionPurchaseCount,
    // Answer analytics
    totalAnswerCount,
    answerEarnerCount,
    avgAnswerEarningsPerUser,
    avgAnswersPerEarner,
    // Creator analytics
    creatorEarnerCount,
    avgCreatorEarningsPerUser,
    // Referral analytics
    referralEarnerCount,
    referralSignupEarners,
    referralAnswerEarners,
    avgReferralEarningsPerEarner,
    // Withdrawals
    totalWithdrawnCents,
    pendingWithdrawalCents,
    pendingWithdrawalCount,
    completedWithdrawalCount,
    avgWithdrawalCents,
    // Wallets
    totalWalletBalanceCents,
    withdrawableBalanceCents,
    nonWithdrawableBalanceCents,
    // Chart data
    earningsSourceBreakdown,
    walletRangeDistribution,
    earnerCategoryDistribution,
    // Top earners
    topEarners,
  });
});

// ── Identity Verification Admin Endpoints ────────────────────────────────────

// GET /admin/verifications — list users who have submitted verification documents. Supports ?page=1&limit=25
router.get("/admin/verifications", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;

  const page  = Math.max(1, parseInt((req.query.page  as string) || "1",  10));
  const limit = Math.min(200, Math.max(0, parseInt((req.query.limit as string) || "0", 10)));
  const offset = (page - 1) * limit;

  const fields = {
    clerkId: usersTable.clerkId,
    email: usersTable.email,
    name: usersTable.name,
    verificationStatus: usersTable.verificationStatus,
    verifiedName: usersTable.verifiedName,
    idDocumentType: usersTable.idDocumentType,
    idDocumentPath: usersTable.idDocumentPath,
    verificationReviewedBy: usersTable.verificationReviewedBy,
    verificationReviewedAt: usersTable.verificationReviewedAt,
    verificationRejectionReason: usersTable.verificationRejectionReason,
    createdAt: usersTable.createdAt,
  };

  let q = db.select(fields)
    .from(usersTable)
    .where(drizzleSql`${usersTable.verificationStatus} != 'unverified'`)
    .orderBy(desc(usersTable.updatedAt))
    .$dynamic();

  // Global status counts (always full, not paged)
  const [allUsers, pagedUsers] = await Promise.all([
    db.select({ status: usersTable.verificationStatus, cnt: count() })
      .from(usersTable)
      .where(drizzleSql`${usersTable.verificationStatus} != 'unverified'`)
      .groupBy(usersTable.verificationStatus),
    limit > 0 ? q.limit(limit).offset(offset) : q,
  ]);

  const statusMap: Record<string, number> = {};
  let total = 0;
  for (const r of allUsers) {
    statusMap[r.status ?? ""] = Number(r.cnt);
    total += Number(r.cnt);
  }
  const pending  = statusMap["pending"]            ?? 0;
  const approved = statusMap["approved"]           ?? 0;
  const rejected = statusMap["rejected"]           ?? 0;
  const reupload = statusMap["reupload_requested"] ?? 0;
  const hasMore  = limit > 0 ? offset + pagedUsers.length < total : false;

  const withDriveLinks = pagedUsers.map(u => ({
    ...u,
    documentViewUrl: u.idDocumentPath
      ? `https://drive.google.com/file/d/${u.idDocumentPath}/view`
      : null,
  }));

  res.json({ users: withDriveLinks, total, hasMore, pending, approved, rejected, reupload });
});

// POST /admin/verifications/:userId/approve — approve a user's identity verification
router.post("/admin/verifications/:userId/approve", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;

  const { userId } = req.params;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (user.verificationStatus !== "pending" && user.verificationStatus !== "reupload_requested") {
    res.status(400).json({ error: "Verification is not pending" });
    return;
  }

  await db.update(usersTable).set({
    verificationStatus: "approved",
    verificationReviewedBy: adminId,
    verificationReviewedAt: new Date(),
    verificationRejectionReason: null,
  }).where(eq(usersTable.clerkId, userId));

  res.json({ success: true, verificationStatus: "approved" });
});

// POST /admin/verifications/:userId/reject — reject a user's verification with a reason
router.post("/admin/verifications/:userId/reject", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;

  const { userId } = req.params;
  const { reason } = req.body;
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "Rejection reason is required" });
    return;
  }

  const [user] = await db.select({ verificationStatus: usersTable.verificationStatus })
    .from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  await db.update(usersTable).set({
    verificationStatus: "rejected",
    verificationReviewedBy: adminId,
    verificationReviewedAt: new Date(),
    verificationRejectionReason: reason.trim(),
  }).where(eq(usersTable.clerkId, userId));

  res.json({ success: true, verificationStatus: "rejected" });
});

// POST /admin/verifications/:userId/request-reupload — ask user to re-upload a clearer document
router.post("/admin/verifications/:userId/request-reupload", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;

  const { userId } = req.params;
  const { reason } = req.body;

  const [user] = await db.select({ verificationStatus: usersTable.verificationStatus })
    .from(usersTable).where(eq(usersTable.clerkId, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  await db.update(usersTable).set({
    verificationStatus: "reupload_requested",
    verificationReviewedBy: adminId,
    verificationReviewedAt: new Date(),
    verificationRejectionReason: reason?.trim() || "Please upload a clearer, valid identity document.",
  }).where(eq(usersTable.clerkId, userId));

  res.json({ success: true, verificationStatus: "reupload_requested" });
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

// ── INTERNAL: GET SERVICE KEY (localhost only) ───────────────────────────────
// Returns the service key for authenticating with the production bulk-moderate endpoint.
// Accessible ONLY from localhost — never exposed externally.
// NOTE: get-service-key removed — it exposed secrets to the public internet via proxy bypass.

// ── INTERNAL BULK MODERATION ────────────────────────────────────────────────
// Localhost-only endpoint for bulk approving/rejecting pending questions.
// Protected exclusively by IP check — only callable from 127.0.0.1.
// Usage: POST /api/admin/internal/bulk-moderate
//   Body: { adminId: string, decisions: Array<{id: number, action: "approve"|"reject", rejectionReason?: string}> }
router.post("/admin/internal/bulk-moderate", async (req, res): Promise<void> => {
  const serviceKey = process.env.CLERK_SECRET_KEY;
  const providedKey = req.headers["x-service-key"] as string | undefined;
  if (!serviceKey || !providedKey || providedKey !== serviceKey) {
    res.status(403).json({ error: "Forbidden — valid X-Service-Key header required" });
    return;
  }

  const { adminId, decisions } = req.body as {
    adminId: string;
    decisions: Array<{ id: number; action: "approve" | "reject" | "archive" | "set-description"; rejectionReason?: string; description?: string }>;
  };

  if (!adminId || !Array.isArray(decisions) || decisions.length === 0) {
    res.status(400).json({ error: "adminId and non-empty decisions array required" });
    return;
  }

  const QUESTION_REFUND_CENTS = 20;
  let approved = 0, rejected = 0, archived = 0, updated = 0, errors = 0;
  const errorList: { id: number; error: string }[] = [];

  for (const d of decisions) {
    try {
      if (d.action === "approve") {
        const [question] = await db.update(questionsTable)
          .set({ status: "active" })
          .where(eq(questionsTable.id, d.id))
          .returning();
        if (!question) { errorList.push({ id: d.id, error: "not found" }); errors++; continue; }

        if (question.creatorId) {
          await db.insert(notificationsTable).values({
            userId: question.creatorId,
            type: "question_approved",
            title: "Question approved! 🎉",
            message: `"${question.title.substring(0, 60)}" is now live and earning you 0.5¢ per answer.`,
            relatedId: question.id,
          });
          notifCacheInvalidate(question.creatorId);
          pushQuestionApproved(question.creatorId, question.title, question.id)
            .catch(err => console.error("[push] bulk question_approved error:", err));
        }
        approved++;

      } else if (d.action === "reject") {
        if (!d.rejectionReason || !REJECTION_REASONS.includes(d.rejectionReason as any)) {
          errorList.push({ id: d.id, error: "invalid rejection reason" }); errors++; continue;
        }
        const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, d.id));
        if (!question) { errorList.push({ id: d.id, error: "not found" }); errors++; continue; }

        await db.update(questionsTable)
          .set({ status: "rejected", rejectionReason: d.rejectionReason, rejectedAt: new Date(), rejectedBy: adminId })
          .where(eq(questionsTable.id, d.id));

        // Refund 20¢ to creator for custom (paid) questions
        if (question.status === "pending" && question.creatorId) {
          const [refundedWallet] = await db.update(walletsTable)
            .set({ balanceCents: drizzleSql`balance_cents + ${QUESTION_REFUND_CENTS}` })
            .where(eq(walletsTable.userId, question.creatorId))
            .returning({ balanceCents: walletsTable.balanceCents });
          if (refundedWallet) {
            await db.insert(transactionsTable).values({
              userId: question.creatorId,
              type: "question_rejection_refund",
              amountCents: QUESTION_REFUND_CENTS,
              description: `Question rejection refund: "${question.title.substring(0, 50)}" (5¢ penalty retained)`,
              status: "completed",
              relatedId: d.id,
            });
          }
        }

        // Notify creator
        if (question.creatorId) {
          const refundNote = question.status === "pending" ? "\n\n20¢ has been refunded to your wallet. 5¢ was kept as a processing penalty." : "";
          await db.insert(notificationsTable).values({
            userId: question.creatorId,
            type: "question_rejected",
            title: "Question not approved",
            message: `"${question.title.substring(0, 60)}" was not approved. Reason: ${d.rejectionReason}.${refundNote}`,
            relatedId: d.id,
          });
          notifCacheInvalidate(question.creatorId);
          // Fire-and-forget rejection email
          const _qcid = question.creatorId;
          const _qtitle = question.title;
          const _qreason = d.rejectionReason;
          const _wasRefunded = question.status === "pending";
          ;(async () => {
            try {
              const [creator] = await db.select({ email: usersTable.email, name: usersTable.name })
                .from(usersTable).where(eq(usersTable.clerkId, _qcid!));
              if (creator?.email) {
                const mail = questionRejectedEmail({ name: creator.name, questionTitle: _qtitle, refunded: _wasRefunded, reason: _qreason });
                await sendEmail({ to: creator.email, subject: mail.subject, html: mail.html, text: mail.text });
              }
            } catch (err) { console.error("[email] bulk question_rejected error:", err); }
          })();
        }
        rejected++;

      } else if (d.action === "archive") {
        const [question] = await db.select().from(questionsTable).where(eq(questionsTable.id, d.id));
        if (!question) { errorList.push({ id: d.id, error: "not found" }); errors++; continue; }
        if (question.status === "archived_duplicate") { archived++; continue; }

        await db.update(questionsTable)
          .set({ status: "archived_duplicate" })
          .where(eq(questionsTable.id, d.id));

        // Clear pending answer flags
        const pendingFlagged = await db.select({ id: answersTable.id })
          .from(answersTable)
          .where(and(eq(answersTable.questionId, d.id), eq(answersTable.flagStatus, "pending")));
        if (pendingFlagged.length > 0) {
          const pIds = pendingFlagged.map(a => a.id);
          await db.update(answersTable).set({ flagStatus: null })
            .where(and(eq(answersTable.questionId, d.id), eq(answersTable.flagStatus, "pending")));
          await db.update(answerFlagsTable).set({ status: "ignored" })
            .where(and(inArray(answerFlagsTable.answerId, pIds), eq(answerFlagsTable.status, "pending")));
        }

        if (question.creatorId) {
          await db.insert(notificationsTable).values({
            userId: question.creatorId,
            type: "question_rejected",
            title: "Question archived",
            message: `"${question.title.substring(0, 60)}" was archived as a duplicate. All your earnings are preserved.`,
            relatedId: d.id,
          });
          notifCacheInvalidate(question.creatorId);
        }
        archived++;

      } else if (d.action === "set-description") {
        if (!d.description || d.description.trim() === "") {
          errorList.push({ id: d.id, error: "description required" }); errors++; continue;
        }
        const result = await db.update(questionsTable)
          .set({ description: d.description.trim() })
          .where(and(eq(questionsTable.id, d.id), eq(questionsTable.status, "active")))
          .returning({ id: questionsTable.id });
        if (!result.length) { errorList.push({ id: d.id, error: "not found or not active" }); errors++; continue; }
        updated++;
      }
    } catch (err) {
      console.error(`[bulk-moderate] Error processing id=${d.id}:`, err);
      errorList.push({ id: d.id, error: String(err) });
      errors++;
    }
  }

  res.json({ approved, rejected, archived, updated, errors, errorList });
});

// ── INTERNAL BULK UNDO ──────────────────────────────────────────────────────
// Localhost OR service-key authenticated endpoint to undo a bulk moderation run.
// Reverts question statuses to pending, reverses refunds, deletes notifications.
router.post("/admin/internal/bulk-undo", async (req, res): Promise<void> => {
  const serviceKey = process.env.CLERK_SECRET_KEY;
  const providedKey = req.headers["x-service-key"] as string | undefined;
  if (!serviceKey || !providedKey || providedKey !== serviceKey) {
    res.status(403).json({ error: "Forbidden — valid X-Service-Key header required" });
    return;
  }

  const { approvedIds, rejectedIds } = req.body as {
    approvedIds: number[];
    rejectedIds: number[];
  };

  if (!Array.isArray(approvedIds) || !Array.isArray(rejectedIds)) {
    res.status(400).json({ error: "approvedIds and rejectedIds arrays required" });
    return;
  }

  let questionsReverted = 0;
  let refundsReversed = 0;
  let notificationsDeleted = 0;
  const errors: string[] = [];

  try {
    // 1. Revert approved questions back to pending
    if (approvedIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < approvedIds.length; i += CHUNK) {
        const chunk = approvedIds.slice(i, i + CHUNK);
        await db.update(questionsTable)
          .set({ status: "pending" })
          .where(and(inArray(questionsTable.id, chunk), eq(questionsTable.status, "active")));
        questionsReverted += chunk.length;
      }
    }

    // 2. Revert rejected questions back to pending, clear rejection fields
    if (rejectedIds.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < rejectedIds.length; i += CHUNK) {
        const chunk = rejectedIds.slice(i, i + CHUNK);
        await db.update(questionsTable)
          .set({
            status: "pending",
            rejectionReason: null,
            rejectedAt: null,
            rejectedBy: null,
          })
          .where(and(inArray(questionsTable.id, chunk), eq(questionsTable.status, "rejected")));
        questionsReverted += chunk.length;
      }
    }

    // 3. Reverse refunds: find each refund transaction and deduct from wallet, then delete it.
    if (rejectedIds.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < rejectedIds.length; i += CHUNK) {
        const chunk = rejectedIds.slice(i, i + CHUNK);

        const refundTxns = await db.select({
          id: transactionsTable.id,
          userId: transactionsTable.userId,
          amountCents: transactionsTable.amountCents,
        })
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.type, "question_rejection_refund"),
            inArray(transactionsTable.relatedId, chunk)
          ));

        for (const txn of refundTxns) {
          await db.update(walletsTable)
            .set({ balanceCents: drizzleSql`GREATEST(0, balance_cents - ${txn.amountCents})` })
            .where(eq(walletsTable.userId, txn.userId));
          await db.delete(transactionsTable)
            .where(eq(transactionsTable.id, txn.id));
          refundsReversed++;
        }
      }
    }

    // 4. Delete notifications created by the bulk run for these questions
    const allIds = [...approvedIds, ...rejectedIds];
    if (allIds.length > 0) {
      const CHUNK = 500;
      for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK);
        const deleted = await db.delete(notificationsTable)
          .where(and(
            inArray(notificationsTable.relatedId, chunk),
            inArray(notificationsTable.type as any, ["question_approved", "question_rejected"] as any)
          ))
          .returning({ id: notificationsTable.id });
        notificationsDeleted += deleted.length;
      }
    }

  } catch (err) {
    console.error("[bulk-undo] Error:", err);
    errors.push(String(err));
  }

  console.log(`[bulk-undo] Done: ${questionsReverted} reverted, ${refundsReversed} refunds reversed, ${notificationsDeleted} notifications deleted`);
  res.json({ questionsReverted, refundsReversed, notificationsDeleted, errors });
});

// ── Cleanup: reverse rewards for answers on rejected questions ────────────────
// Idempotent — safe to run multiple times. Returns a full audit report.
// Auth: Clerk admin session OR X-Service-Key header (= CLERK_SECRET_KEY value)
router.post("/admin/internal/cleanup-rejected-answers", async (req, res): Promise<void> => {
  const serviceKey   = process.env.CLERK_SECRET_KEY;
  const providedKey  = req.headers["x-service-key"] as string | undefined;
  const serviceKeyOk = serviceKey && providedKey && providedKey === serviceKey;
  if (!serviceKeyOk) {
    if (!await checkAdmin(req, res)) return;
  }

  // Dry-run mode: just report the scope without making changes
  const dryRun = req.query.dryRun === "true";

  if (dryRun) {
    const [{ rejectedQs }] = await db
      .select({ rejectedQs: count() })
      .from(questionsTable)
      .where(eq(questionsTable.status, "rejected"));

    const [{ affectedAnswers }] = await db
      .select({ affectedAnswers: count() })
      .from(answersTable)
      .innerJoin(questionsTable, eq(questionsTable.id, answersTable.questionId))
      .where(eq(questionsTable.status, "rejected"));

    const [{ alreadyCleaned }] = await db
      .select({ alreadyCleaned: count() })
      .from(answersTable)
      .innerJoin(questionsTable, eq(questionsTable.id, answersTable.questionId))
      .where(and(eq(questionsTable.status, "rejected"), eq(answersTable.flagStatus, "removed")));

    res.json({
      dryRun: true,
      rejectedQuestions: Number(rejectedQs),
      totalAnswers: Number(affectedAnswers),
      alreadyCleaned: Number(alreadyCleaned),
      toProcess: Number(affectedAnswers) - Number(alreadyCleaned),
    });
    return;
  }

  // Run actual cleanup — may take several seconds on large datasets
  try {
    const report = await cleanupRejectedAnswers();
    res.json(report);
  } catch (err) {
    console.error("[cleanup-rejected-answers] Fatal error:", err);
    res.status(500).json({ error: "Cleanup failed", detail: String(err) });
  }
});

// ── Ban / Unban user ──────────────────────────────────────────────────────────

router.post("/admin/users/:id/ban", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;

  const targetClerkId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { reason, banIp } = req.body as { reason?: string; banIp?: boolean };

  if (targetClerkId === adminId) {
    res.status(400).json({ error: "You cannot ban your own account." });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.clerkId, targetClerkId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isAdmin) { res.status(400).json({ error: "Admin accounts cannot be banned." }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({ isBanned: true, bannedReason: reason || null, bannedAt: new Date(), bannedBy: adminId })
    .where(eq(usersTable.clerkId, targetClerkId))
    .returning();

  console.log(`[ban] Admin ${adminId} banned user ${targetClerkId} — reason: ${reason ?? "none"}`);

  let ipBanned = false;
  if (banIp && target.lastIp) {
    await db
      .insert(bannedIpsTable)
      .values({ ipAddress: target.lastIp, reason: reason || null, bannedUserId: targetClerkId, bannedBy: adminId })
      .onConflictDoUpdate({
        target: bannedIpsTable.ipAddress,
        set: { reason: reason || null, bannedUserId: targetClerkId, bannedBy: adminId, bannedAt: new Date() },
      });
    console.log(`[ban] Also banned IP ${target.lastIp} for user ${targetClerkId}`);
    ipBanned = true;
  }

  res.json({ ...updated, ipBanned });
});

router.post("/admin/users/:id/unban", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;

  const targetClerkId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const [target] = await db.select().from(usersTable).where(eq(usersTable.clerkId, targetClerkId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const [updated] = await db
    .update(usersTable)
    .set({ isBanned: false, bannedReason: null, bannedAt: null, bannedBy: null })
    .where(eq(usersTable.clerkId, targetClerkId))
    .returning();

  console.log(`[ban] Admin ${adminId} unbanned user ${targetClerkId}`);
  res.json(updated);
});

// ── Banned IPs management ─────────────────────────────────────────────────────

router.get("/admin/banned-ips", async (req, res): Promise<void> => {
  if (!await checkAdmin(req, res)) return;
  const rows = await db.select().from(bannedIpsTable).orderBy(desc(bannedIpsTable.bannedAt));
  res.json({ bannedIps: rows });
});

router.delete("/admin/banned-ips/:ip", async (req, res): Promise<void> => {
  const adminId = await checkAdmin(req, res);
  if (!adminId) return;
  const ip = decodeURIComponent(Array.isArray(req.params.ip) ? req.params.ip[0] : req.params.ip);
  await db.delete(bannedIpsTable).where(eq(bannedIpsTable.ipAddress, ip));
  console.log(`[ban] Admin ${adminId} unbanned IP ${ip}`);
  res.json({ ok: true });
});

export default router;

