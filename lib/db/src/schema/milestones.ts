import { pgTable, serial, integer, doublePrecision, timestamp, unique } from "drizzle-orm/pg-core";

export const questionMilestonesTable = pgTable("question_milestones", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").notNull(),
  milestone: integer("milestone").notNull(),
  rewardCents: doublePrecision("reward_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("question_milestones_question_milestone_unique").on(t.questionId, t.milestone),
]);

export type QuestionMilestone = typeof questionMilestonesTable.$inferSelect;
