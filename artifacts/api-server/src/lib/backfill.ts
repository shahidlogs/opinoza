import { db, referralsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * One-time backfill: approve all referrals that were flagged solely because
 * of the now-removed `same_ip_as_click` heuristic.
 *
 * These were legitimate sign-ups where the user clicked the invite link and
 * signed up on the same device — normal behaviour, not fraud.
 * Their rewards were already credited; this just corrects the status.
 *
 * The function is idempotent: if there are no such rows it does nothing.
 */
export async function backfillApproveReferrals(): Promise<void> {
  const result = await db.execute(
    sql`
      UPDATE referrals
      SET    status      = 'approved',
             fraud_flags = '[]'::jsonb,
             updated_at  = NOW()
      WHERE  status      = 'flagged'
        AND  fraud_flags = '["same_ip_as_click"]'::jsonb
    `
  );
  const count = (result as any).rowCount ?? 0;
  if (count > 0) {
    logger.info({ count }, "Backfill: approved referrals previously flagged only for same_ip_as_click");
  } else {
    logger.info("Backfill: no same_ip_as_click-only referrals to approve — nothing to do");
  }
}
