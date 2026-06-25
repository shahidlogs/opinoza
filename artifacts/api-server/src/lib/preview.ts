import { db, answersTable } from "@workspace/db";
import { count, desc, and, inArray, or, isNull, ne, sql } from "drizzle-orm";

export type PreviewRow = { label: string; count: number; pct: number };
export type PreviewData = { rows: PreviewRow[] };

/**
 * Batch-fetches answer preview data for all given question IDs in a single SQL
 * query.  No N+1: one round-trip regardless of how many questions are on the page.
 *
 * • poll   → groups by poll_option, returns percentages
 * • rating → groups by rating (formatted as "5★"), returns percentages
 * • short  → groups by normalizedAnswer (admin-set) or LOWER(TRIM(answerText)),
 *            returns raw counts
 *
 * Removed/hidden answers (flagStatus = 'removed') are excluded.
 */
export async function computePreviewData(
  questionIds: number[],
  questions: { id: number; type: string }[],
): Promise<Map<number, PreviewData>> {
  if (questionIds.length === 0) return new Map();

  const qTypeMap = new Map<number, string>(
    questions.map(q => [q.id, q.type]),
  );

  const labelExpr = sql<string>`CASE
    WHEN ${answersTable.pollOption} IS NOT NULL THEN ${answersTable.pollOption}
    WHEN ${answersTable.rating}     IS NOT NULL THEN ${answersTable.rating}::text
    ELSE COALESCE(${answersTable.normalizedAnswer}, LOWER(TRIM(${answersTable.answerText})))
  END`;

  const rows = await db
    .select({ questionId: answersTable.questionId, label: labelExpr, cnt: count() })
    .from(answersTable)
    .where(and(
      inArray(answersTable.questionId, questionIds),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
      sql`(${answersTable.pollOption}      IS NOT NULL
        OR ${answersTable.rating}          IS NOT NULL
        OR ${answersTable.answerText}      IS NOT NULL
        OR ${answersTable.normalizedAnswer} IS NOT NULL)`,
    ))
    .groupBy(answersTable.questionId, labelExpr)
    .orderBy(answersTable.questionId, desc(count()));

  const grouped = new Map<number, { label: string; cnt: number }[]>();
  for (const row of rows) {
    if (row.label == null) continue;
    const qid = row.questionId!;
    if (!grouped.has(qid)) grouped.set(qid, []);
    grouped.get(qid)!.push({ label: String(row.label), cnt: Number(row.cnt) });
  }

  const previewMap = new Map<number, PreviewData>();
  for (const [qid, entries] of grouped) {
    const type = qTypeMap.get(qid);
    if (!type || entries.length === 0) continue;

    const total = entries.reduce((s, r) => s + r.cnt, 0);
    const top3  = entries.slice(0, 3);

    let previewRows: PreviewRow[];
    if (type === "rating") {
      previewRows = top3.map(r => ({
        label: `${r.label}★`,
        count: r.cnt,
        pct: total > 0 ? Math.round((r.cnt / total) * 100) : 0,
      }));
    } else if (type === "poll") {
      previewRows = top3.map(r => ({
        label: r.label,
        count: r.cnt,
        pct: total > 0 ? Math.round((r.cnt / total) * 100) : 0,
      }));
    } else {
      previewRows = top3.map(r => ({ label: r.label, count: r.cnt, pct: 0 }));
    }

    previewMap.set(qid, { rows: previewRows });
  }

  return previewMap;
}

/** Attaches a `preview` field to each question object using a single batch query. */
export async function attachPreviews(questions: { id: number; type: string }[]): Promise<any[]> {
  if (questions.length === 0) return questions;
  const previewMap = await computePreviewData(questions.map(q => q.id), questions);
  return questions.map(q => ({ ...q, preview: previewMap.get(q.id) ?? null }));
}
