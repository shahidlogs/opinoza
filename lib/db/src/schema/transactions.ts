import { pgTable, text, serial, timestamp, doublePrecision, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  amountCents: doublePrecision("amount_cents").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("completed"),
  relatedId: integer("related_id"),
  accountTitle: text("account_title"),
  bankName: text("bank_name"),
  meta: jsonb("meta"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  transferredAt: timestamp("transferred_at", { withTimezone: true }),
  paymentEmailSentAt: timestamp("payment_email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
