/**
 * Opinoza Push Notification Service
 *
 * Sends event-based push notifications via OneSignal REST API.
 * Enforces a rolling 24-hour cap per user (default: 3 notifications).
 * Deduplicates events using dedupKey to prevent repeat fires.
 * Gracefully degrades when ONESIGNAL_REST_API_KEY is not set.
 */

import { db, pushNotificationLogsTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";

// ── Constants ────────────────────────────────────────────────────────────────

const ONESIGNAL_APP_ID = "1779561a-7866-42c1-8b8a-99cc9d4630af";
const ONESIGNAL_API_URL = "https://api.onesignal.com/api/v1/notifications";

// ── Config ───────────────────────────────────────────────────────────────────

export type PushNotificationType =
  | "question_approved"
  | "question_answered"
  | "invitation_accepted"
  | "bonus_received"
  | "new_question";

interface PushConfig {
  dailyCap: number;
  enabled: Record<PushNotificationType, boolean>;
}

export const PUSH_CONFIG: PushConfig = {
  dailyCap: parseInt(process.env.PUSH_DAILY_CAP ?? "3", 10),
  enabled: {
    question_approved:   (process.env.PUSH_ENABLE_QUESTION_APPROVED   ?? "true") === "true",
    question_answered:   (process.env.PUSH_ENABLE_QUESTION_ANSWERED   ?? "true") === "true",
    invitation_accepted: (process.env.PUSH_ENABLE_INVITATION_ACCEPTED ?? "true") === "true",
    bonus_received:      (process.env.PUSH_ENABLE_BONUS_RECEIVED      ?? "true") === "true",
    new_question:        (process.env.PUSH_ENABLE_NEW_QUESTION        ?? "true") === "true",
  },
};

// Priority order: lower number = higher priority (used in log comments)
export const PUSH_PRIORITY: Record<PushNotificationType, number> = {
  bonus_received:      1,
  question_approved:   2,
  question_answered:   3,
  invitation_accepted: 4,
  new_question:        5,
};

// ── Status values ────────────────────────────────────────────────────────────

type PushStatus = "sent" | "rate_limited" | "skipped" | "disabled" | "failed" | "no_key";

// ── Core send function ───────────────────────────────────────────────────────

export interface SendPushOptions {
  userId: string;
  type: PushNotificationType;
  title: string;
  message: string;
  url?: string;
  dedupKey?: string;
}

export async function sendPush(opts: SendPushOptions): Promise<void> {
  const { userId, type, title, message, url, dedupKey } = opts;

  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  const label = `[push][${type}][user:${userId.slice(-6)}]`;

  // ── 1. API key guard ──────────────────────────────────────────────────────
  if (!apiKey) {
    console.warn(`${label} ONESIGNAL_REST_API_KEY not set — push skipped`);
    await _log(userId, type, title, message, "no_key", undefined, dedupKey);
    return;
  }

  // ── 2. Type enabled check ─────────────────────────────────────────────────
  if (!PUSH_CONFIG.enabled[type]) {
    console.info(`${label} type disabled in config — skipped`);
    await _log(userId, type, title, message, "disabled", undefined, dedupKey);
    return;
  }

  // ── 3. Dedup check ────────────────────────────────────────────────────────
  if (dedupKey) {
    const existing = await db
      .select({ id: pushNotificationLogsTable.id })
      .from(pushNotificationLogsTable)
      .where(
        and(
          eq(pushNotificationLogsTable.userId, userId),
          eq(pushNotificationLogsTable.dedupKey, dedupKey),
          eq(pushNotificationLogsTable.status, "sent"),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.info(`${label} duplicate (dedupKey: ${dedupKey}) — skipped`);
      return;
    }
  }

  // ── 4. Rolling 24-hour cap check ──────────────────────────────────────────
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ value: recentCount }] = await db
    .select({ value: count() })
    .from(pushNotificationLogsTable)
    .where(
      and(
        eq(pushNotificationLogsTable.userId, userId),
        eq(pushNotificationLogsTable.status, "sent"),
        gte(pushNotificationLogsTable.sentAt, since),
      ),
    );

  if (recentCount >= PUSH_CONFIG.dailyCap) {
    console.info(
      `${label} rate-limited (${recentCount}/${PUSH_CONFIG.dailyCap} in 24h) — skipped`,
    );
    await _log(userId, type, title, message, "rate_limited", undefined, dedupKey);
    return;
  }

  // ── 5. Send via OneSignal REST API ────────────────────────────────────────
  const body: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    include_aliases: { external_id: [userId] },
    target_channel: "push",
    headings: { en: title },
    contents: { en: message },
  };
  if (url) body.url = url;

  try {
    const res = await fetch(ONESIGNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { id?: string; errors?: unknown };

    if (!res.ok || data.errors) {
      console.error(`${label} OneSignal error (${res.status}):`, data.errors ?? data);
      await _log(userId, type, title, message, "failed", undefined, dedupKey);
      return;
    }

    const onesignalId = data.id;
    console.info(
      `${label} sent — onesignalId: ${onesignalId} (${recentCount + 1}/${PUSH_CONFIG.dailyCap} today)`,
    );
    await _log(userId, type, title, message, "sent", onesignalId, dedupKey);
  } catch (err) {
    console.error(`${label} network error:`, err);
    await _log(userId, type, title, message, "failed", undefined, dedupKey);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function _log(
  userId: string,
  type: string,
  title: string,
  message: string,
  status: PushStatus,
  onesignalId?: string,
  dedupKey?: string,
): Promise<void> {
  await db.insert(pushNotificationLogsTable).values({
    userId,
    type,
    title,
    message,
    status,
    onesignalId: onesignalId ?? null,
    dedupKey: dedupKey ?? null,
  }).catch((err) => console.error("[push][log] DB insert failed:", err));
}

// ── Typed helpers ─────────────────────────────────────────────────────────────
// Convenience wrappers — keeps call sites clean and type-safe.

export function pushQuestionApproved(userId: string, questionTitle: string, questionId: number) {
  return sendPush({
    userId,
    type: "question_approved",
    title: "Your question was approved ✅",
    message: "Your question is now live and users can start answering it.",
    url: `https://opinoza.com/questions/${questionId}`,
    dedupKey: `question_approved_${questionId}`,
  });
}

export function pushQuestionAnswered(userId: string, questionTitle: string, questionId: number, answerId: number) {
  return sendPush({
    userId,
    type: "question_answered",
    title: "Your question got a new answer 👀",
    message: `Someone just answered "${questionTitle.substring(0, 60)}". Check it now.`,
    url: `https://opinoza.com/questions/${questionId}`,
    dedupKey: `answered_${questionId}_${answerId}`,
  });
}

export function pushInvitationAccepted(referrerUserId: string, inviteeClerkId: string) {
  return sendPush({
    userId: referrerUserId,
    type: "invitation_accepted",
    title: "Your invitation was accepted 🎉",
    message: "A new user joined through your invitation. You've earned a referral bonus!",
    url: "https://opinoza.com/invite",
    dedupKey: `invite_accepted_${inviteeClerkId}`,
  });
}

export function pushBonusReceived(userId: string, label: string, dedupKey: string, url?: string) {
  return sendPush({
    userId,
    type: "bonus_received",
    title: "Bonus received 💰",
    message: label,
    url: url ?? "https://opinoza.com/wallet",
    dedupKey,
  });
}
