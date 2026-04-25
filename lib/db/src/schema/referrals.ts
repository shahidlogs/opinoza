import { pgTable, text, serial, timestamp, doublePrecision, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerUserId: text("referrer_user_id").notNull(),
  referredUserId: text("referred_user_id").notNull().unique(),
  referralCodeUsed: text("referral_code_used").notNull(),
  signupBonusCents: doublePrecision("signup_bonus_cents").notNull().default(10),
  answerBonusCentsTotal: doublePrecision("answer_bonus_cents_total").notNull().default(0),
  signupBonusGrantedAt: timestamp("signup_bonus_granted_at", { withTimezone: true }),
  answerMilestoneBonusGrantedAt: timestamp("answer_milestone_bonus_granted_at", { withTimezone: true }),
  referrerClickIp: text("referrer_click_ip"),
  referredSignupIp: text("referred_signup_ip"),
  referredUserAgent: text("referred_user_agent"),
  status: text("status").notNull().default("approved"),
  fraudFlags: jsonb("fraud_flags").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const referralClicksTable = pgTable("referral_clicks", {
  id: serial("id").primaryKey(),
  referralCode: text("referral_code").notNull(),
  referrerUserId: text("referrer_user_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referralsTable.$inferSelect;

export const insertReferralClickSchema = createInsertSchema(referralClicksTable).omit({ id: true, createdAt: true });
export type InsertReferralClick = z.infer<typeof insertReferralClickSchema>;
export type ReferralClick = typeof referralClicksTable.$inferSelect;
