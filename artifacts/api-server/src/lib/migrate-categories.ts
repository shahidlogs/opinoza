import { db, questionsTable } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";
import { VALID_CATEGORIES } from "@workspace/api-zod";
import { logger } from "./logger";

const CATEGORY_MAP: Record<string, string> = {
  "Fun":            "Entertainment",
  "Preferences":    "Personal Profile",
  "Personal":       "Personal Profile",
  "Profile":        "Personal Profile",
  "Social":         "Social & Society",
  "Transportation": "Transport & Travel",
  "Travel":         "Transport & Travel",
  "Finance":        "Finance & Economy",
  "Politics":       "Politics & World Affairs",
  "Health & Fitness": "Health & Wellness",
  "Healthcare":     "Health & Wellness",
  "Shopping":       "Shopping & Brands",
  "Environment":    "Environment & Nature",
};

export async function migrateCategories(): Promise<void> {
  let totalMigrated = 0;

  // Migrate each known old category to its canonical replacement
  for (const [oldCat, newCat] of Object.entries(CATEGORY_MAP)) {
    const rows = await db
      .update(questionsTable)
      .set({ category: newCat })
      .where(eq(questionsTable.category, oldCat))
      .returning({ id: questionsTable.id });

    if (rows.length > 0) {
      logger.info({ oldCat, newCat, count: rows.length }, "Category migrated");
      totalMigrated += rows.length;
    }
  }

  // Catch-all: anything still invalid → "Other"
  const catchAll = await db
    .update(questionsTable)
    .set({ category: "Other" })
    .where(notInArray(questionsTable.category, [...VALID_CATEGORIES]))
    .returning({ id: questionsTable.id, category: questionsTable.category });

  if (catchAll.length > 0) {
    const found = [...new Set(catchAll.map(r => r.category))];
    logger.warn({ unknownCategories: found, count: catchAll.length }, "Unknown categories mapped to Other");
    totalMigrated += catchAll.length;
  }

  if (totalMigrated > 0) {
    logger.info({ totalMigrated }, "Category migration complete");
  } else {
    logger.info("Category migration: all categories already valid, nothing to do");
  }
}
