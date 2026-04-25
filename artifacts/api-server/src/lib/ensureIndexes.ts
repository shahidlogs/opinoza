import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Creates performance indexes at startup if they don't already exist.
 * Uses IF NOT EXISTS so subsequent restarts are a no-op (instant).
 * These indexes are applied to whichever database DATABASE_URL points to,
 * covering both dev and production environments.
 *
 * Index rationale (see also: perf-audit comments inline):
 *
 * answers:
 *  idx_answers_user_question   — duplicate check + reward guard (user_id, question_id)
 *  idx_answers_user_created    — hourly limit check (user_id, created_at DESC)
 *  idx_answers_flag_status     — pending-flag block check (user_id, flag_status); partial so only non-null rows are indexed
 *
 * transactions:
 *  idx_transactions_created_at  — kept for general range scans
 *  idx_transactions_user_created — per-user transaction history (wallet history page)
 *  idx_transactions_type_created — daily-cap query on feed load: type + created_at + amount filter
 *
 * notifications:
 *  idx_notifications_user_created — per-user notification feed (no index existed before)
 *
 * questions:
 *  idx_questions_feed           — feed ordering (total_answers, created_at, id); partial active+non-profile
 *  idx_questions_status_profile — status + profile filter
 */
export async function ensureIndexes(): Promise<void> {
  const indexes: Array<{ name: string; ddl: string }> = [
    // ── Existing indexes (kept unchanged) ──────────────────────────────────────
    {
      name: "idx_answers_user_question",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_answers_user_question
          ON answers(user_id, question_id)
      `,
    },
    {
      name: "idx_transactions_created_at",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_transactions_created_at
          ON transactions(created_at)
      `,
    },
    {
      name: "idx_questions_feed",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_questions_feed
          ON questions(total_answers ASC, created_at DESC, id DESC)
          WHERE status = 'active' AND is_profile_question = false
      `,
    },
    {
      name: "idx_questions_status_profile",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_questions_status_profile
          ON questions(status, is_profile_question)
      `,
    },

    // ── New indexes added after perf audit ────────────────────────────────────

    // answers(user_id, created_at DESC)
    // Used by: hourly answer-limit check — WHERE user_id = $1 AND created_at >= NOW()-1h
    // Without this index the DB does a full table scan of ALL answers for every submission.
    // At 100 K answers/day (~3 M rows/month) this becomes catastrophically slow.
    {
      name: "idx_answers_user_created",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_answers_user_created
          ON answers(user_id, created_at DESC)
      `,
    },

    // answers(user_id, flag_status) partial — only rows where flag_status IS NOT NULL
    // Used by: pending-flag block check — WHERE user_id = $1 AND flag_status = 'pending'
    // The vast majority of answers have flag_status = NULL so the partial index is tiny.
    {
      name: "idx_answers_flag_status",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_answers_flag_status
          ON answers(user_id, flag_status)
          WHERE flag_status IS NOT NULL
      `,
    },

    // notifications(user_id, created_at DESC)
    // Used by: every notification-feed load — WHERE user_id = $1 ORDER BY created_at DESC
    // No index existed at all on this table beyond the PK; every load was a full table scan.
    {
      name: "idx_notifications_user_created",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created
          ON notifications(user_id, created_at DESC)
      `,
    },

    // transactions(user_id, created_at DESC)
    // Used by: wallet history page — WHERE user_id = $1 ORDER BY created_at DESC LIMIT N
    // Also used by any per-user transaction lookup.
    {
      name: "idx_transactions_user_created",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_transactions_user_created
          ON transactions(user_id, created_at DESC)
      `,
    },

    // transactions(type, created_at DESC) partial — only positive-amount rows
    // Used by: feed daily-cap query — runs on EVERY feed request (shared cache miss).
    // The query filters: type IN (...earning types...) AND amount_cents > 0 AND created_at >= NOW()-1d
    // The partial WHERE amount_cents > 0 eliminates refunds/withdrawals from the index entirely.
    {
      name: "idx_transactions_type_created",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_transactions_type_created
          ON transactions(type, created_at DESC)
          WHERE amount_cents > 0
      `,
    },

    // questions(creator_id, status)
    // Used by:
    //   1. Daily limit check on question submission — WHERE creator_id = $1 AND status IN ('active','pending')
    //      Runs on EVERY question submission; without this index it full-scans the questions table.
    //   2. Privileged-creator ID cache rebuild — SELECT id FROM questions WHERE creator_id IN (...)
    // At 100 K questions the table scan would add ~10-30 ms per question submission.
    {
      name: "idx_questions_creator_status",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_questions_creator_status
          ON questions(creator_id, status)
          WHERE creator_id IS NOT NULL
      `,
    },

    // wallets(user_id) — already covered by UNIQUE constraint (implicit B-tree index)
    // No additional index needed; listed here for documentation completeness.

    // answers(question_id) — covering index for total_answers increment and answer count queries
    // The PK index covers lookups by id; we need question_id for aggregate queries.
    {
      name: "idx_answers_question_id",
      ddl: `
        CREATE INDEX IF NOT EXISTS idx_answers_question_id
          ON answers(question_id)
      `,
    },
  ];

  for (const { name, ddl } of indexes) {
    try {
      await db.execute(sql.raw(ddl));
      logger.info({ name }, "Index: verified");
    } catch (err) {
      logger.error({ err, name }, "Index creation failed (non-fatal — server will continue)");
    }
  }
}
