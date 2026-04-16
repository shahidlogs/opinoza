/**
 * Earnings milestone checker — called fire-and-forget after any wallet credit.
 *
 * Rule 3: When a user's lifetime earnings first reach $5 (500¢):
 *   - Send one in-app notification
 *   - Send one email asking them to confirm their profile name
 *   - Set earning_500_notified_at so it never fires again
 *
 * Rule 4: When a user's lifetime earnings reach $10 (1000¢):
 *   - Set name_locked = true (only admin can change name after this)
 */

import { db, walletsTable, usersTable, notificationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail, confirmNameEmail } from "./email.js";

const EARNINGS_500_CENTS = 500;
const EARNINGS_1000_CENTS = 1000;

export async function checkEarningsMilestones(clerkId: string): Promise<void> {
  try {
    const [wallet] = await db.select({ totalEarnedCents: walletsTable.totalEarnedCents })
      .from(walletsTable).where(eq(walletsTable.userId, clerkId));
    if (!wallet) return;

    const total = wallet.totalEarnedCents;

    const [user] = await db.select({
      email: usersTable.email,
      name: usersTable.name,
      earning500NotifiedAt: usersTable.earning500NotifiedAt,
      nameLocked: usersTable.nameLocked,
      isAdmin: usersTable.isAdmin,
    }).from(usersTable).where(eq(usersTable.clerkId, clerkId));
    if (!user) return;

    // ── Rule 3: $5 threshold — notify once ───────────────────────────────────
    if (total >= EARNINGS_500_CENTS && !user.earning500NotifiedAt) {
      // Mark as notified first (prevents duplicate if email/notification throws)
      await db.update(usersTable)
        .set({ earning500NotifiedAt: new Date() })
        .where(eq(usersTable.clerkId, clerkId));

      // In-app notification
      await db.insert(notificationsTable).values({
        userId: clerkId,
        type: "name_confirmation_required",
        title: "Please confirm your profile name",
        message:
          "You've earned $5! Your payment account must be in the same real name as your profile. " +
          "If names don't match, your payment cannot be transferred. Please verify your name now.",
      });

      // Email — fire-and-forget
      if (user.email) {
        const mail = confirmNameEmail({ name: user.name, email: user.email });
        sendEmail({ to: user.email, subject: mail.subject, html: mail.html, text: mail.text })
          .then(ok => { if (ok) console.info(`[email] $5 name confirmation sent to ${user.email}`); })
          .catch(err => console.error("[email] $5 name confirmation error:", err));
      }

      console.info(`[milestones] $5 name confirmation triggered for ${clerkId}`);
    }

    // ── Rule 4: $10 threshold — lock name ────────────────────────────────────
    if (total >= EARNINGS_1000_CENTS && !user.nameLocked) {
      await db.update(usersTable)
        .set({ nameLocked: true })
        .where(eq(usersTable.clerkId, clerkId));

      console.info(`[milestones] Name locked for ${clerkId} (total earned: ${total}¢)`);
    }
  } catch (err) {
    console.error("[milestones] checkEarningsMilestones error:", err);
  }
}
