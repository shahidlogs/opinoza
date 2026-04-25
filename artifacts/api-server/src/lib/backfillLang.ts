/**
 * Language backfill / re-classify: detect and save the correct language code
 * for every question row.
 *
 * Re-runs on every server start so that improvements to detectLang() are
 * automatically applied without needing a manual migration.  The cost is
 * negligible: detectLang() is pure CPU (no network), and the UPDATE is a
 * single batch of parallel DB writes that finishes in ~200 ms even for 2 K rows.
 *
 * Logic:
 *   - For each question, re-detect lang from title + description.
 *   - Only issue an UPDATE when the newly-detected value differs from the
 *     currently-stored value, so this is a no-op on a stable dataset after the
 *     first run.
 */
import { db, questionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { detectLang } from "./langDetect.js";

export async function backfillLang(): Promise<void> {
  const rows = await db
    .select({
      id: questionsTable.id,
      title: questionsTable.title,
      description: questionsTable.description,
      lang: questionsTable.lang,
    })
    .from(questionsTable);

  if (rows.length === 0) return;

  let updated = 0;
  let unchanged = 0;

  await Promise.all(
    rows.map(row => {
      const text = [row.title, row.description].filter(Boolean).join(" ");
      const detected = detectLang(text);
      const newLang = detected === "und" ? null : detected;

      // Skip the DB round-trip if the value is already correct.
      if (newLang === (row.lang ?? null)) {
        unchanged++;
        return Promise.resolve();
      }

      updated++;
      return db.update(questionsTable)
        .set({ lang: newLang })
        .where(eq(questionsTable.id, row.id));
    }),
  );

  // eslint-disable-next-line no-console
  console.log(
    `[backfillLang] ${rows.length} rows processed — ${updated} updated, ${unchanged} unchanged.`,
  );
}
