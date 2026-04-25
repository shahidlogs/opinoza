/**
 * Daily Engagement Push Notifications
 *
 * Runs once per day at 10:00 UTC. Classifies every non-admin user into a
 * segment and sends one targeted push notification per day. Users active in
 * the last 6 hours are always skipped. Deduplication is enforced via a
 * daily dedupKey so a user cannot receive more than one engagement push
 * even if the job is accidentally triggered twice.
 *
 * Segment priority (highest first):
 *  1. new_tester     — account < 7 days old (Android closed-test cohort)
 *  2. power_user     — 50+ answers, inactive 24–72 h
 *  3. inactive_72h   — no activity for 24–72 hours
 *  4. inactive_7d    — no activity for 3–7 days
 *  5. inactive_long  — no activity for 7+ days
 *  6. never_answered — has account but no answers yet
 */

import cron from "node-cron";
import { db, usersTable, answersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendPush } from "./push.js";
import { logger } from "./logger.js";

// ── Segment types ─────────────────────────────────────────────────────────────

type Segment =
  | "new_tester"
  | "power_user"
  | "inactive_72h"
  | "inactive_7d"
  | "inactive_long"
  | "never_answered";

interface UserData {
  clerkId: string;
  createdAt: Date;
  answerCount: number;
  lastAnsweredAt: Date | null;
}

// ── Message library ───────────────────────────────────────────────────────────

const MESSAGES: Record<Segment, { title: string; message: string }> = {
  new_tester: {
    title: "You're in! 🎉",
    message: "Thanks for testing Opinoza. App testers get special priority for rewards — keep answering!",
  },
  power_user: {
    title: "Fresh questions are waiting",
    message: "You've been earning great on Opinoza. New questions are ready for you today.",
  },
  inactive_72h: {
    title: "New questions are waiting",
    message: "New questions are waiting for you on Opinoza. Answer today and keep earning.",
  },
  inactive_7d: {
    title: "Come back and earn",
    message: "You have new earning opportunities on Opinoza. Come share your opinion today.",
  },
  inactive_long: {
    title: "We have fresh questions for you",
    message: "New questions have been added to Opinoza. Share your opinion and earn today.",
  },
  never_answered: {
    title: "Start earning on Opinoza",
    message: "Your first answer on Opinoza earns you 1¢. Hundreds of questions are waiting for you.",
  },
};

// ── Segmentation logic ────────────────────────────────────────────────────────

function classify(user: UserData, now: Date): Segment | null {
  const ageDays = (now.getTime() - user.createdAt.getTime()) / 86_400_000;

  // 1. New tester (account younger than 7 days) — highest engagement priority
  if (ageDays < 7) return "new_tester";

  // 2. Never answered
  if (!user.lastAnsweredAt) return "never_answered";

  const inactiveHours = (now.getTime() - user.lastAnsweredAt.getTime()) / 3_600_000;

  // 3. Power user inactive 24–72 h
  if (user.answerCount >= 50 && inactiveHours >= 24 && inactiveHours < 72) return "power_user";

  // 4. Inactive 24–72 hours
  if (inactiveHours >= 24 && inactiveHours < 72) return "inactive_72h";

  // 5. Inactive 3–7 days
  if (inactiveHours >= 72 && inactiveHours < 168) return "inactive_7d";

  // 6. Inactive 7+ days
  if (inactiveHours >= 168) return "inactive_long";

  // Active within 24 hours — should have been caught by the 6-hour guard already
  return null;
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runDailyEngagement(): Promise<void> {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  logger.info("[engagement] Starting daily engagement run");

  // Single query: all non-admin users + answer stats via LEFT JOIN
  const rows = await db
    .select({
      clerkId:        usersTable.clerkId,
      createdAt:      usersTable.createdAt,
      answerCount:    sql<number>`COUNT(${answersTable.id})`,
      lastAnsweredAt: sql<string | null>`MAX(${answersTable.createdAt})`,
    })
    .from(usersTable)
    .leftJoin(answersTable, eq(answersTable.userId, usersTable.clerkId))
    .where(eq(usersTable.isAdmin, false))
    .groupBy(usersTable.clerkId, usersTable.createdAt);

  logger.info(`[engagement] ${rows.length} non-admin users to evaluate`);

  let sent = 0;
  let skippedActive = 0;
  let skippedNoSegment = 0;

  for (const row of rows) {
    const user: UserData = {
      clerkId:       row.clerkId,
      createdAt:     new Date(row.createdAt),
      answerCount:   Number(row.answerCount ?? 0),
      lastAnsweredAt: row.lastAnsweredAt ? new Date(row.lastAnsweredAt) : null,
    };

    // Rule: skip users active in the last 6 hours
    if (user.lastAnsweredAt && user.lastAnsweredAt >= sixHoursAgo) {
      skippedActive++;
      continue;
    }

    const segment = classify(user, now);
    if (!segment) {
      skippedNoSegment++;
      continue;
    }

    const { title, message } = MESSAGES[segment];

    await sendPush({
      userId:   user.clerkId,
      type:     "engagement",
      title,
      message,
      url:      "https://opinoza.com/questions",
      dedupKey: `engagement_${todayKey}`,
    });

    sent++;

    // Brief delay to avoid hammering the OneSignal API
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  logger.info(
    `[engagement] Daily run complete — ${sent} sent, ` +
    `${skippedActive} skipped (active <6h), ${skippedNoSegment} skipped (no segment)`,
  );
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

export function scheduleEngagementPush(): void {
  // Fire at 10:00 UTC every day
  cron.schedule("0 10 * * *", () => {
    runDailyEngagement().catch(err =>
      logger.error({ err }, "[engagement] Daily run failed"),
    );
  }, { timezone: "UTC" });

  logger.info("[engagement] Daily engagement scheduler registered — runs at 10:00 UTC");
}
