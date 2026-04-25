import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const bannedIpsTable = pgTable("banned_ips", {
  id: serial("id").primaryKey(),
  ipAddress: text("ip_address").notNull().unique(),
  reason: text("reason"),
  bannedUserId: text("banned_user_id"),
  bannedBy: text("banned_by").notNull(),
  bannedAt: timestamp("banned_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BannedIp = typeof bannedIpsTable.$inferSelect;
