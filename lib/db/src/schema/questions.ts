import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questionsTable = pgTable("questions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  category: text("category").notNull(),
  categories: text("categories").array(),
  status: text("status").notNull().default("active"),
  pollOptions: text("poll_options").array(),
  creatorId: text("creator_id"),
  creatorName: text("creator_name"),
  isCustom: boolean("is_custom").notNull().default(false),
  isProfileQuestion: boolean("is_profile_question").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  featuredPosition: integer("featured_position"),
  totalAnswers: integer("total_answers").notNull().default(0),
  lang: text("lang"),
  rejectionReason: text("rejection_reason"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectedBy: text("rejected_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({ id: true, createdAt: true, updatedAt: true, totalAnswers: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
