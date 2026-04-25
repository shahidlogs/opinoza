import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const answersTable = pgTable("answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  userId: text("user_id").notNull(),
  answerText: text("answer_text"),
  pollOption: text("poll_option"),
  rating: integer("rating"),
  notFamiliar: boolean("not_familiar").default(false).notNull(),
  reason: text("reason"),
  flagStatus: text("flag_status"),
  noRewardReason: text("no_reward_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnswerSchema = createInsertSchema(answersTable).omit({ id: true, createdAt: true });
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;
export type Answer = typeof answersTable.$inferSelect;
