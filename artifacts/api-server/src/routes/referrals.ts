import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable, walletsTable, transactionsTable, notificationsTable, referralsTable, referralClicksTable } from "@workspace/db";
import { pushInvitationAccepted } from "../lib/push.js";
import { eq, desc, count, sum, and, ne, gte, sql, inArray } from "drizzle-orm";

const router: IRouter = Router();

const APP_BASE_URL = process.env.APP_BASE_URL || "https://opinoza.com";
const REFERRAL_TIER_1_BONUS_CENTS = 10;  // 10¢ for first 5 successful invites
const REFERRAL_TIER_2_BONUS_CENTS = 20;  // 20¢ for every invite after the first 5
const REFERRAL_TIER_1_LIMIT = 5;         // switch to tier 2 after this many successful invites
const REFERRAL_ANSWER_BONUS_CENTS = 0.5; // 0.5¢ per answer by referred user

// ─── GET /api/referrals/me ────────────────────────────────────────────────────
router.get("/referrals/me", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!user || !user.referralCode) {
    res.status(404).json({ error: "User or referral code not found" });
    return;
  }

  const link = `${APP_BASE_URL}/?ref=${user.referralCode}`;

  // Referrals I made (I am the referrer)
  const myReferrals = await db.select().from(referralsTable)
    .where(eq(referralsTable.referrerUserId, auth.userId))
    .orderBy(desc(referralsTable.createdAt));

  // Aggregate totals
  const totalSignups = myReferrals.length;
  const approvedReferrals = myReferrals.filter(r => r.status !== "rejected");
  const totalEarnedCents = approvedReferrals.reduce(
    (sum, r) => sum + r.signupBonusCents + r.answerBonusCentsTotal, 0
  );
  const pendingCount = myReferrals.filter(r => r.status === "pending").length;

  // Enrich with referred user names
  const referredClerkIds = myReferrals.map(r => r.referredUserId);
  let referredUsers: Array<{ clerkId: string; name: string | null; email: string }> = [];
  if (referredClerkIds.length > 0) {
    referredUsers = await db
      .select({ clerkId: usersTable.clerkId, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.clerkId, referredClerkIds));
  }
  const userMap = Object.fromEntries(referredUsers.map(u => [u.clerkId, u]));

  const enriched = myReferrals.map(r => ({
    ...r,
    referredUserName: userMap[r.referredUserId]?.name || "Anonymous",
    referredUserEmail: userMap[r.referredUserId]?.email || "",
  }));

  res.json({
    referralCode: user.referralCode,
    referralLink: link,
    totalSignups,
    totalEarnedCents,
    pendingCount,
    referrals: enriched,
  });
});

// ─── POST /api/referrals/click ────────────────────────────────────────────────
router.post("/referrals/click", async (req, res): Promise<void> => {
  const { referralCode } = req.body;
  if (!referralCode || typeof referralCode !== "string") {
    res.status(400).json({ error: "referralCode is required" });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;
  const sessionId = req.headers["x-session-id"] as string || null;

  // Look up who owns this code
  const [owner] = await db.select({ clerkId: usersTable.clerkId })
    .from(usersTable)
    .where(eq(usersTable.referralCode, referralCode));

  await db.insert(referralClicksTable).values({
    referralCode,
    referrerUserId: owner?.clerkId || null,
    ipAddress: ip,
    userAgent: ua,
    sessionId,
  });

  res.json({ ok: true });
});

// ─── POST /api/referrals/claim ────────────────────────────────────────────────
// Called by frontend after a new user signs in for the first time.
// Accepts an explicit referralCode from localStorage, or falls back to
// 24-hour IP-based attribution if no code is available.
router.post("/referrals/claim", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  const ua = req.headers["user-agent"] || null;

  // Resolve referral code: explicit code (from localStorage) takes priority;
  // if absent/empty, fall back to 24-hour IP-based attribution window.
  let referralCode: string | null =
    (typeof req.body.referralCode === "string" && req.body.referralCode.trim())
      ? req.body.referralCode.trim()
      : null;

  if (!referralCode && ip) {
    const window24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentClick] = await db
      .select({ referralCode: referralClicksTable.referralCode })
      .from(referralClicksTable)
      .where(
        and(
          eq(referralClicksTable.ipAddress, ip),
          gte(referralClicksTable.createdAt, window24h),
        )
      )
      .orderBy(desc(referralClicksTable.createdAt))
      .limit(1);
    if (recentClick) {
      referralCode = recentClick.referralCode;
    }
  }

  if (!referralCode) {
    // No code from localStorage and no matching click in the past 24h — nothing to claim.
    res.json({ ok: true, skipped: true });
    return;
  }

  // Ensure current user exists
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!currentUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Already referred? Idempotent — succeed silently
  if (currentUser.referredByUserId) {
    res.json({ ok: true, alreadyClaimed: true });
    return;
  }

  // Find referrer by code
  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode));
  if (!referrer) {
    res.status(404).json({ error: "Invalid referral code" });
    return;
  }

  // Self-referral prevention
  if (referrer.clerkId === auth.userId) {
    res.status(400).json({ error: "You cannot refer yourself" });
    return;
  }

  // Already a referral entry for this referred user?
  const [existingReferral] = await db.select({ id: referralsTable.id })
    .from(referralsTable)
    .where(eq(referralsTable.referredUserId, auth.userId));
  if (existingReferral) {
    res.json({ ok: true, alreadyClaimed: true });
    return;
  }

  // ── Fraud detection ──────────────────────────────────────────────────────
  const fraudFlags: string[] = [];

  // IP velocity: flag if >3 referral signups from same IP in the last 24h
  if (ip) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [velocityRow] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(referralsTable)
      .where(
        and(
          eq(referralsTable.referredSignupIp, ip),
          gte(referralsTable.createdAt, oneDayAgo),
        )
      );
    if ((velocityRow?.cnt ?? 0) >= 3) fraudFlags.push("ip_velocity");
  }

  const status = fraudFlags.length > 0 ? "flagged" : "approved";

  // ── Tiered signup bonus: 10¢ for first 5 invites, 20¢ thereafter ────────
  const [{ existingCount }] = await db
    .select({ existingCount: sql<number>`COUNT(*)::int` })
    .from(referralsTable)
    .where(
      and(
        eq(referralsTable.referrerUserId, referrer.clerkId),
        ne(referralsTable.status, "rejected"),
      )
    );
  const signupBonusCents = (existingCount ?? 0) < REFERRAL_TIER_1_LIMIT
    ? REFERRAL_TIER_1_BONUS_CENTS
    : REFERRAL_TIER_2_BONUS_CENTS;

  // ── Create referral record ───────────────────────────────────────────────
  const [referral] = await db.insert(referralsTable).values({
    referrerUserId: referrer.clerkId,
    referredUserId: auth.userId,
    referralCodeUsed: referralCode,
    signupBonusCents,
    answerBonusCentsTotal: 0,
    referredSignupIp: ip,
    referredUserAgent: ua,
    status,
    fraudFlags: fraudFlags.length > 0 ? fraudFlags : [],
    signupBonusGrantedAt: new Date(),
  }).returning();

  // Mark the referred user with who referred them
  await db.update(usersTable)
    .set({ referredByUserId: referrer.clerkId })
    .where(eq(usersTable.clerkId, auth.userId));

  // ── Award signup bonus to referrer (always — flagged is for admin review only) ──
  let [referrerWallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, referrer.clerkId));
  if (!referrerWallet) {
    [referrerWallet] = await db.insert(walletsTable).values({ userId: referrer.clerkId }).returning();
  }

  await db.update(walletsTable)
    .set({
      balanceCents: referrerWallet.balanceCents + signupBonusCents,
      totalEarnedCents: referrerWallet.totalEarnedCents + signupBonusCents,
    })
    .where(eq(walletsTable.userId, referrer.clerkId));

  await db.insert(transactionsTable).values({
    userId: referrer.clerkId,
    type: "referral_signup_bonus",
    amountCents: signupBonusCents,
    description: `Referral signup bonus: ${currentUser.name || currentUser.email || "a new user"} joined`,
    status: "completed",
  });

  await db.insert(notificationsTable).values({
    userId: referrer.clerkId,
    type: "referral_signup",
    title: "Your invite worked! 🎉",
    message: `${currentUser.name || "Someone"} joined via your referral link — you earned ${signupBonusCents}¢!`,
  });

  // Push notification: invitation accepted — fire-and-forget
  pushInvitationAccepted(referrer.clerkId, auth.userId)
    .catch(err => console.error("[push] invitation_accepted error:", err));

  res.json({ ok: true, alreadyClaimed: false, status, fraudFlags });
});

// ─── GET /api/referrals/admin/by-user ────────────────────────────────────────
// Returns per-referrer rollup: count, who they referred, income breakdown.
// Read-only aggregation — no DB writes.
router.get("/referrals/admin/by-user", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));

  if (referrals.length === 0) {
    res.json({ referrers: [] });
    return;
  }

  const allIds = [...new Set([
    ...referrals.map(r => r.referrerUserId),
    ...referrals.map(r => r.referredUserId),
  ])];

  const users = await db
    .select({ clerkId: usersTable.clerkId, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(inArray(usersTable.clerkId, allIds));
  const userMap = Object.fromEntries(users.map(u => [u.clerkId, u]));

  // Group referrals by referrer
  const grouped = new Map<string, typeof referrals>();
  for (const r of referrals) {
    if (!grouped.has(r.referrerUserId)) grouped.set(r.referrerUserId, []);
    grouped.get(r.referrerUserId)!.push(r);
  }

  const referrers = [...grouped.entries()].map(([referrerId, refs]) => {
    const u = userMap[referrerId];
    const active = refs.filter(r => r.status !== "rejected");
    const totalSignupBonus = active.reduce((s, r) => s + r.signupBonusCents, 0);
    const totalAnswerBonus = active.reduce((s, r) => s + r.answerBonusCentsTotal, 0);

    return {
      referrerId,
      referrerName: u?.name || "Unknown",
      referrerEmail: u?.email || "",
      totalReferred: refs.length,
      activeReferred: active.length,
      totalSignupBonus,
      totalAnswerBonus,
      totalReferralIncome: totalSignupBonus + totalAnswerBonus,
      referrals: refs.map(r => ({
        id: r.id,
        referredName: userMap[r.referredUserId]?.name || "Unknown",
        referredEmail: userMap[r.referredUserId]?.email || "",
        signupBonusCents: r.signupBonusCents,
        answerBonusCentsTotal: r.answerBonusCentsTotal,
        status: r.status,
        fraudFlags: r.fraudFlags ?? [],
        createdAt: r.createdAt,
      })),
    };
  }).sort((a, b) => b.totalReferralIncome - a.totalReferralIncome);

  res.json({ referrers });
});

// ─── Admin helpers (require isAdmin) ─────────────────────────────────────────
async function requireAdmin(req: any, res: any): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [user] = await db.select({ isAdmin: usersTable.isAdmin }).from(usersTable)
    .where(eq(usersTable.clerkId, auth.userId));
  if (!user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return null; }
  return auth.userId;
}

// GET /api/referrals/admin/stats
router.get("/referrals/admin/stats", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const all = await db.select().from(referralsTable);
  const totalReferrals = all.length;
  const approved = all.filter(r => r.status === "approved");
  const flagged = all.filter(r => r.status === "flagged");
  const rejected = all.filter(r => r.status === "rejected");
  // totalPaidCents includes approved + flagged — both receive earnings; only rejected are reversed
  const totalPaidCents = all
    .filter(r => r.status !== "rejected")
    .reduce((s, r) => s + r.signupBonusCents + r.answerBonusCentsTotal, 0);

  res.json({
    totalReferrals,
    approvedCount: approved.length,
    flaggedCount: flagged.length,
    rejectedCount: rejected.length,
    totalPaidCents,
  });
});

// GET /api/referrals/admin/list
router.get("/referrals/admin/list", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const referrals = await db.select().from(referralsTable).orderBy(desc(referralsTable.createdAt));

  // Enrich with user info for both referrer and referred
  const allIds = [
    ...referrals.map(r => r.referrerUserId),
    ...referrals.map(r => r.referredUserId),
  ];
  const uniqueIds = [...new Set(allIds)];

  let users: Array<{ clerkId: string; name: string | null; email: string }> = [];
  if (uniqueIds.length > 0) {
    users = await db.select({ clerkId: usersTable.clerkId, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(inArray(usersTable.clerkId, uniqueIds));
  }
  const userMap = Object.fromEntries(users.map(u => [u.clerkId, u]));

  const enriched = referrals.map(r => ({
    ...r,
    referrerName: userMap[r.referrerUserId]?.name || "Unknown",
    referrerEmail: userMap[r.referrerUserId]?.email || "",
    referredName: userMap[r.referredUserId]?.name || "Unknown",
    referredEmail: userMap[r.referredUserId]?.email || "",
  }));

  res.json({ referrals: enriched });
});

// PATCH /api/referrals/admin/:id/status
router.patch("/referrals/admin/:id/status", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status } = req.body;
  if (!["approved", "flagged", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const [existing] = await db.select().from(referralsTable).where(eq(referralsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Referral not found" }); return; }

  // If approving a previously non-approved referral, grant signup bonus
  const wasPreviouslyNotApproved = existing.status !== "approved";
  const nowApproved = status === "approved";

  const updates: any = { status };
  if (nowApproved && wasPreviouslyNotApproved && !existing.signupBonusGrantedAt) {
    updates.signupBonusGrantedAt = new Date();

    // Grant the bonus
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, existing.referrerUserId));
    if (!wallet) {
      [wallet] = await db.insert(walletsTable).values({ userId: existing.referrerUserId }).returning();
    }
    await db.update(walletsTable)
      .set({
        balanceCents: wallet.balanceCents + existing.signupBonusCents,
        totalEarnedCents: wallet.totalEarnedCents + existing.signupBonusCents,
      })
      .where(eq(walletsTable.userId, existing.referrerUserId));

    await db.insert(transactionsTable).values({
      userId: existing.referrerUserId,
      type: "referral_signup_bonus",
      amountCents: existing.signupBonusCents,
      description: `Referral approved by admin — signup bonus granted`,
      status: "completed",
    });
  }

  const [updated] = await db.update(referralsTable).set(updates).where(eq(referralsTable.id, id)).returning();
  res.json(updated);
});

// POST /api/referrals/admin/:id/reverse
// Reverses a referral — deducts earned bonuses from the referrer's wallet
router.post("/referrals/admin/:id/reverse", async (req, res): Promise<void> => {
  if (!await requireAdmin(req, res)) return;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [referral] = await db.select().from(referralsTable).where(eq(referralsTable.id, id));
  if (!referral) { res.status(404).json({ error: "Referral not found" }); return; }
  if (referral.status === "rejected") { res.json({ ok: true, message: "Already rejected" }); return; }

  const totalReversalCents = referral.signupBonusCents + referral.answerBonusCentsTotal;

  if (totalReversalCents > 0 && referral.signupBonusGrantedAt) {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, referral.referrerUserId));
    if (wallet) {
      const newBalance = Math.max(0, wallet.balanceCents - totalReversalCents);
      await db.update(walletsTable)
        .set({ balanceCents: newBalance })
        .where(eq(walletsTable.userId, referral.referrerUserId));

      await db.insert(transactionsTable).values({
        userId: referral.referrerUserId,
        type: "referral_reversal",
        amountCents: -totalReversalCents,
        description: `Referral reversed by admin (${totalReversalCents}¢ reclaimed)`,
        status: "completed",
      });
    }
  }

  await db.update(referralsTable)
    .set({ status: "rejected" })
    .where(eq(referralsTable.id, id));

  res.json({ ok: true, reversedCents: totalReversalCents });
});

// ─── Shared helper exported for use by answers route ────────────────────────
// Award 0.5¢ referral answer bonus to the referrer of a given answerer.
export async function awardReferralAnswerBonus(answererClerkId: string, relatedId?: number): Promise<void> {
  try {
    const [user] = await db.select({ referredByUserId: usersTable.referredByUserId })
      .from(usersTable)
      .where(eq(usersTable.clerkId, answererClerkId));

    if (!user?.referredByUserId) return;

    const [referral] = await db.select().from(referralsTable)
      .where(
        and(
          eq(referralsTable.referredUserId, answererClerkId),
          eq(referralsTable.referrerUserId, user.referredByUserId),
        )
      );

    if (!referral || referral.status === "rejected") return;

    // Credit referrer
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, user.referredByUserId));
    if (!wallet) {
      [wallet] = await db.insert(walletsTable).values({ userId: user.referredByUserId }).returning();
    }
    await db.update(walletsTable)
      .set({
        balanceCents: wallet.balanceCents + REFERRAL_ANSWER_BONUS_CENTS,
        totalEarnedCents: wallet.totalEarnedCents + REFERRAL_ANSWER_BONUS_CENTS,
      })
      .where(eq(walletsTable.userId, user.referredByUserId));

    await db.insert(transactionsTable).values({
      userId: user.referredByUserId,
      type: "referral_answer_bonus",
      amountCents: REFERRAL_ANSWER_BONUS_CENTS,
      description: `Referral answer bonus: your invite answered a question`,
      status: "completed",
      relatedId,
    });

    // Update cumulative total on referral record
    await db.update(referralsTable)
      .set({ answerBonusCentsTotal: referral.answerBonusCentsTotal + REFERRAL_ANSWER_BONUS_CENTS })
      .where(eq(referralsTable.id, referral.id));
  } catch (err) {
    console.error("[referrals] awardReferralAnswerBonus error:", err);
  }
}

export default router;
