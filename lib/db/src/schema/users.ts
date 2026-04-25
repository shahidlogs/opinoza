import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull(),
  name: text("name"),
  city: text("city"),
  ageGroup: text("age_group"),
  gender: text("gender"),
  isAdmin: boolean("is_admin").notNull().default(false),
  isEditor: boolean("is_editor").notNull().default(false),
  nameRewarded: boolean("name_rewarded").notNull().default(false),
  cityRewarded: boolean("city_rewarded").notNull().default(false),
  ageGroupRewarded: boolean("age_group_rewarded").notNull().default(false),
  genderRewarded: boolean("gender_rewarded").notNull().default(false),
  phoneNumber: text("phone_number"),
  referralCode: text("referral_code").unique(),
  referredByUserId: text("referred_by_user_id"),
  signupIp: text("signup_ip"),
  userAgent: text("user_agent"),
  lastQuestionAt: timestamp("last_question_at", { withTimezone: true }),
  lastAnswerNotificationEmailAt: timestamp("last_answer_notification_email_at", { withTimezone: true }),
  // Rule 3: set once when user's lifetime earnings first cross $5 (500¢)
  earning500NotifiedAt: timestamp("earning_500_notified_at", { withTimezone: true }),
  // Rule 4: set to true when user's lifetime earnings reach $10 (1000¢); only admin can unlock
  nameLocked: boolean("name_locked").notNull().default(false),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  verifiedName: text("verified_name"),
  idDocumentType: text("id_document_type"),
  idDocumentPath: text("id_document_path"),
  verificationReviewedBy: text("verification_reviewed_by"),
  verificationReviewedAt: timestamp("verification_reviewed_at", { withTimezone: true }),
  verificationRejectionReason: text("verification_rejection_reason"),
  isBanned: boolean("is_banned").notNull().default(false),
  bannedReason: text("banned_reason"),
  bannedAt: timestamp("banned_at", { withTimezone: true }),
  bannedBy: text("banned_by"),
  lastIp: text("last_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
