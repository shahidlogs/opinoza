import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const pushNotificationLogsTable = pgTable("push_notification_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull(),
  onesignalId: text("onesignal_id"),
  dedupKey: text("dedup_key"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PushNotificationLog = typeof pushNotificationLogsTable.$inferSelect;
