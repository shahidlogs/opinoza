import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";

export const answerFlagsTable = pgTable("answer_flags", {
  id: serial("id").primaryKey(),
  answerId: integer("answer_id").notNull(),
  flaggedByUserId: text("flagged_by_user_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueFlag: unique("answer_flags_unique_per_user").on(t.answerId, t.flaggedByUserId),
}));

export type AnswerFlag = typeof answerFlagsTable.$inferSelect;
