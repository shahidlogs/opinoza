import { db, questionsTable, usersTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Backfill migration: sync questions.creator_name with the current users.name.
 *
 * Runs once at startup. Safe to re-run — only updates rows where the stored
 * creator_name differs from the current user name (or is null while the user
 * has a name).  Any question whose creator no longer exists in the users table
 * is left untouched (the old snapshot name is kept as-is).
 */
export async function syncCreatorNames(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE ${questionsTable} q
    SET creator_name = u.name
    FROM ${usersTable} u
    WHERE q.creator_id = u.clerk_id
      AND u.name IS NOT NULL
      AND (q.creator_name IS DISTINCT FROM u.name)
    RETURNING q.id
  `);

  const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  if (count > 0) {
    logger.info({ count }, "[syncCreatorNames] Synced creator_name on questions to current user name");
  } else {
    logger.info("[syncCreatorNames] All question creator names already in sync");
  }
}
