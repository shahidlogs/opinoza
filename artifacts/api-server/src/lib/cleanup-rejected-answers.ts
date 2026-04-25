/**
 * Cleanup: Rejected-Question Answers
 *
 * Finds answers that were submitted while a question was approved but the
 * question was later rejected.  Performs three safe, idempotent operations:
 *
 *   1. Mark each affected answer flag_status = 'removed'
 *   2. Insert reversal transactions for every earning / creator_reward
 *      that was paid for those answers (skips already-reversed ones).
 *      Wallets are decremented by GREATEST(0, balance - reversal) — never
 *      goes negative.
 *   3. Reduce questions.total_answers by the number of answers removed.
 *
 * Idempotent: safe to run more than once.
 *   - Answers already 'removed' are skipped up-front.
 *   - Reversal transactions already present (same relatedId + type) are skipped.
 */

import { db, answersTable, questionsTable, transactionsTable, walletsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CleanupReport {
  startedAt: string;
  completedAt: string;
  rejectedQuestionsScanned: number;
  answersFound: number;
  answersAlreadyCleaned: number;
  answersMarkedRemoved: number;
  earningTxReversed: number;
  earningTxSkippedNoWallet: number;
  creatorRewardTxReversed: number;
  creatorRewardTxSkippedNoWallet: number;
  totalCentsReclaimed: number;
  usersAffected: number;
  questionsAnswerCountUpdated: number;
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Drizzle's inArray errors on empty arrays — guard it
function safeInArray<TColumn>(col: TColumn, ids: number[]) {
  if (ids.length === 0) throw new Error("safeInArray called with empty array");
  return inArray(col as Parameters<typeof inArray>[0], ids);
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function cleanupRejectedAnswers(): Promise<CleanupReport> {
  const startedAt = new Date();
  const report: CleanupReport = {
    startedAt: startedAt.toISOString(),
    completedAt: "",
    rejectedQuestionsScanned: 0,
    answersFound: 0,
    answersAlreadyCleaned: 0,
    answersMarkedRemoved: 0,
    earningTxReversed: 0,
    earningTxSkippedNoWallet: 0,
    creatorRewardTxReversed: 0,
    creatorRewardTxSkippedNoWallet: 0,
    totalCentsReclaimed: 0,
    usersAffected: 0,
    questionsAnswerCountUpdated: 0,
    errors: [],
  };

  console.log("[cleanup] Starting rejected-answer cleanup");

  // ── Step 1: Fetch all rejected question IDs ───────────────────────────────
  const rejectedQuestions = await db
    .select({ id: questionsTable.id })
    .from(questionsTable)
    .where(eq(questionsTable.status, "rejected"));

  report.rejectedQuestionsScanned = rejectedQuestions.length;
  const rejectedQIds = rejectedQuestions.map(q => q.id);
  console.log(`[cleanup] ${rejectedQIds.length} rejected questions`);

  if (rejectedQIds.length === 0) {
    report.completedAt = new Date().toISOString();
    return report;
  }

  // ── Step 2: Fetch all answers for rejected questions (batched) ─────────────
  const allAnswers: Array<{
    id: number;
    userId: string;
    questionId: number;
    flagStatus: string | null;
    noRewardReason: string | null;
  }> = [];

  for (const batch of chunk(rejectedQIds, 500)) {
    const rows = await db
      .select({
        id:             answersTable.id,
        userId:         answersTable.userId,
        questionId:     answersTable.questionId,
        flagStatus:     answersTable.flagStatus,
        noRewardReason: answersTable.noRewardReason,
      })
      .from(answersTable)
      .where(safeInArray(answersTable.questionId, batch));
    allAnswers.push(...rows);
  }

  const toClean = allAnswers.filter(a => a.flagStatus !== "removed");
  const already = allAnswers.filter(a => a.flagStatus === "removed");

  report.answersFound       = allAnswers.length;
  report.answersAlreadyCleaned = already.length;
  console.log(
    `[cleanup] ${allAnswers.length} answers total — ` +
    `${already.length} already removed, ${toClean.length} to process`
  );

  if (toClean.length === 0) {
    report.completedAt = new Date().toISOString();
    return report;
  }

  const toCleanIds = toClean.map(a => a.id);

  // ── Step 3: Mark answers as removed (batched) ─────────────────────────────
  for (const batch of chunk(toCleanIds, 500)) {
    await db
      .update(answersTable)
      .set({ flagStatus: "removed" })
      .where(safeInArray(answersTable.id, batch));
  }
  report.answersMarkedRemoved = toCleanIds.length;
  console.log(`[cleanup] ${toCleanIds.length} answers marked removed`);

  // ── Step 4: Fetch earning + creator_reward transactions ───────────────────
  // Only for answers that had no anti-fraud block (those never paid out).
  const rewardedIds = toClean.filter(a => !a.noRewardReason).map(a => a.id);
  console.log(`[cleanup] ${rewardedIds.length} answers may have had rewards`);

  type TxRow = { id: number; userId: string; type: string; amountCents: number; relatedId: number | null };
  const originalTxs: TxRow[] = [];

  if (rewardedIds.length > 0) {
    for (const batch of chunk(rewardedIds, 500)) {
      const rows = await db
        .select({
          id:          transactionsTable.id,
          userId:      transactionsTable.userId,
          type:        transactionsTable.type,
          amountCents: transactionsTable.amountCents,
          relatedId:   transactionsTable.relatedId,
        })
        .from(transactionsTable)
        .where(
          and(
            safeInArray(transactionsTable.relatedId, batch),
            inArray(transactionsTable.type, ["earning", "creator_reward"]),
            eq(transactionsTable.status, "completed"),
          )
        );
      originalTxs.push(...(rows as TxRow[]));
    }
    console.log(`[cleanup] ${originalTxs.length} original reward transactions found`);

    // Idempotency: skip any already reversed
    const reversedRelatedIds = new Set<number>();
    for (const batch of chunk(rewardedIds, 500)) {
      const rows = await db
        .select({ relatedId: transactionsTable.relatedId })
        .from(transactionsTable)
        .where(
          and(
            safeInArray(transactionsTable.relatedId, batch),
            inArray(transactionsTable.type, ["earning_reversal", "creator_reward_reversal"]),
          )
        );
      for (const r of rows) {
        if (r.relatedId !== null) reversedRelatedIds.add(r.relatedId);
      }
    }
    console.log(`[cleanup] ${reversedRelatedIds.size} already reversed (will skip)`);

    // Remove already-reversed transactions from processing set
    const before = originalTxs.length;
    const filtered = originalTxs.filter(t => t.relatedId === null || !reversedRelatedIds.has(t.relatedId));
    originalTxs.length = 0;
    originalTxs.push(...filtered);
    if (before !== originalTxs.length)
      console.log(`[cleanup] ${before - originalTxs.length} transactions skipped (already reversed)`);
  }

  // ── Step 5: Aggregate reversals per user ──────────────────────────────────
  interface UserRev {
    earningCents: number;
    creatorCents: number;
    earningTxs: TxRow[];
    creatorTxs: TxRow[];
  }
  const byUser = new Map<string, UserRev>();

  for (const tx of originalTxs) {
    const entry = byUser.get(tx.userId) ?? { earningCents: 0, creatorCents: 0, earningTxs: [], creatorTxs: [] };
    if (tx.type === "earning") {
      entry.earningCents += Math.abs(Number(tx.amountCents));
      entry.earningTxs.push(tx);
    } else {
      entry.creatorCents += Math.abs(Number(tx.amountCents));
      entry.creatorTxs.push(tx);
    }
    byUser.set(tx.userId, entry);
  }

  report.usersAffected = byUser.size;
  console.log(`[cleanup] ${byUser.size} users need wallet adjustments`);

  // ── Step 6: Fetch wallets for affected users ───────────────────────────────
  const userIds = [...byUser.keys()];
  const walletBalance = new Map<string, number>();

  for (const batch of chunk(userIds, 500)) {
    const rows = await db
      .select({ userId: walletsTable.userId, balanceCents: walletsTable.balanceCents })
      .from(walletsTable)
      .where(inArray(walletsTable.userId, batch));
    for (const w of rows) walletBalance.set(w.userId, Number(w.balanceCents));
  }

  // ── Step 7: Insert reversals + update wallets ──────────────────────────────
  for (const [userId, rev] of byUser.entries()) {
    const totalReversal = rev.earningCents + rev.creatorCents;
    const hasWallet     = walletBalance.has(userId);

    if (!hasWallet) {
      report.earningTxSkippedNoWallet      += rev.earningTxs.length;
      report.creatorRewardTxSkippedNoWallet += rev.creatorTxs.length;
      console.warn(`[cleanup] user ${userId.slice(-8)} has no wallet — reversal transactions logged, wallet unchanged`);
    }

    // Insert one reversal transaction per original reward transaction (full audit trail)
    for (const tx of rev.earningTxs) {
      try {
        await db.insert(transactionsTable).values({
          userId,
          type:        "earning_reversal",
          amountCents: -Math.abs(Number(tx.amountCents)),
          description: "Reward reversed: question was rejected after answers were collected",
          status:      "completed",
          relatedId:   tx.relatedId,
        });
        report.earningTxReversed++;
        report.totalCentsReclaimed += Math.abs(Number(tx.amountCents));
      } catch (err) {
        const msg = `earning_reversal insert failed for tx ${tx.id}: ${String(err)}`;
        report.errors.push(msg);
        console.error(`[cleanup] ${msg}`);
      }
    }

    for (const tx of rev.creatorTxs) {
      try {
        await db.insert(transactionsTable).values({
          userId,
          type:        "creator_reward_reversal",
          amountCents: -Math.abs(Number(tx.amountCents)),
          description: "Creator reward reversed: question was rejected after answers were collected",
          status:      "completed",
          relatedId:   tx.relatedId,
        });
        report.creatorRewardTxReversed++;
        report.totalCentsReclaimed += Math.abs(Number(tx.amountCents));
      } catch (err) {
        const msg = `creator_reward_reversal insert failed for tx ${tx.id}: ${String(err)}`;
        report.errors.push(msg);
        console.error(`[cleanup] ${msg}`);
      }
    }

    // Wallet update — clamp at zero, never negative
    if (hasWallet && totalReversal > 0) {
      try {
        await db
          .update(walletsTable)
          .set({
            balanceCents:     sql`GREATEST(0, balance_cents - ${totalReversal})`,
            totalEarnedCents: sql`GREATEST(0, total_earned_cents - ${totalReversal})`,
          })
          .where(eq(walletsTable.userId, userId));
      } catch (err) {
        const msg = `wallet update failed for user ${userId.slice(-8)}: ${String(err)}`;
        report.errors.push(msg);
        console.error(`[cleanup] ${msg}`);
      }
    }
  }

  console.log(
    `[cleanup] Reversals done: ${report.earningTxReversed} earning, ` +
    `${report.creatorRewardTxReversed} creator_reward, ` +
    `${report.totalCentsReclaimed / 100}$ total reclaimed`
  );

  // ── Step 8: Correct questions.total_answers ───────────────────────────────
  const removedByQ = new Map<number, number>();
  for (const a of toClean) {
    removedByQ.set(a.questionId, (removedByQ.get(a.questionId) ?? 0) + 1);
  }

  for (const [qId, n] of removedByQ.entries()) {
    try {
      await db
        .update(questionsTable)
        .set({ totalAnswers: sql`GREATEST(0, total_answers - ${n})` })
        .where(eq(questionsTable.id, qId));
      report.questionsAnswerCountUpdated++;
    } catch (err) {
      const msg = `total_answers update failed for question ${qId}: ${String(err)}`;
      report.errors.push(msg);
      console.error(`[cleanup] ${msg}`);
    }
  }

  console.log(`[cleanup] total_answers corrected for ${report.questionsAnswerCountUpdated} questions`);

  report.completedAt = new Date().toISOString();
  console.log("[cleanup] Complete:", JSON.stringify(report, null, 2));
  return report;
}
