import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { getAuth } from "@clerk/express";
import { db, walletsTable, transactionsTable, notificationsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql, gt } from "drizzle-orm";
import { notifCacheInvalidate } from "../lib/notifCache";
import { checkUserBan, checkIpBan, BAN_MESSAGE, IP_BAN_MESSAGE } from "../lib/banCheck";
import { getClientIp } from "../lib/clientIp";

// IP-based rate limiter: max 5 withdrawal attempts per 15 minutes per IP.
// Acts as a first line of defence before any DB queries run.
const withdrawRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many withdrawal requests. Please wait before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const ALLOWED_METHODS = ["PayPal", "Bank Transfer", "USDT"] as const;
const USDT_NETWORKS = ["TRC20", "ERC20", "BEP20"] as const;

const router: IRouter = Router();

router.get("/wallet", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId));
  if (!wallet) {
    [wallet] = await db.insert(walletsTable).values({ userId: auth.userId }).returning();
  }

  // Compute total withdrawn from actual transferred transactions (source of truth),
  // not the cached counter — guards against any double-counting drift.
  const [withdrawnRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(ABS(${transactionsTable.amountCents})), 0)` })
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, auth.userId),
        eq(transactionsTable.type, "withdrawal"),
        eq(transactionsTable.status, "transferred"),
      )
    );
  const totalWithdrawnCents = Number(withdrawnRow?.total ?? 0);

  res.json({
    id: wallet.id,
    userId: wallet.userId,
    balanceCents: wallet.balanceCents,
    totalEarnedCents: wallet.totalEarnedCents,
    totalWithdrawnCents,
  });
});

router.get("/wallet/transactions", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const transactions = await db.select().from(transactionsTable)
    .where(eq(transactionsTable.userId, auth.userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(100);

  res.json({ transactions });
});

router.get("/wallet/withdrawals", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const transactions = await db.select().from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, auth.userId),
        eq(transactionsTable.type, "withdrawal"),
      )
    )
    .orderBy(desc(transactionsTable.createdAt));

  res.json({ transactions });
});

router.post("/wallet/withdraw", withdrawRateLimit, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // ── 0. Ban checks ────────────────────────────────────────────────────────
  const clientIp = getClientIp(req);
  const userBan = await checkUserBan(auth.userId);
  if (userBan.banned) {
    res.status(403).json({ error: BAN_MESSAGE, code: "account_banned" });
    return;
  }
  if (await checkIpBan(clientIp)) {
    res.status(403).json({ error: IP_BAN_MESSAGE, code: "ip_banned" });
    return;
  }

  // Update lastIp on every withdrawal attempt (best-effort)
  db.update(usersTable).set({ lastIp: clientIp }).where(eq(usersTable.clerkId, auth.userId))
    .catch(err => console.error("[wallet] Failed to update lastIp:", err));

  const {
    amountCents,
    paymentMethod,
    paymentDetails,
    accountTitle,
    bankName,
    usdtNetwork,
    usdtAddress,
    usdtOwnerName,
  } = req.body;

  // ── 1. Input validation — never trust the client ───────────────────────────
  if (!amountCents || typeof amountCents !== "number" || !Number.isFinite(amountCents) || amountCents <= 0) {
    res.status(400).json({ error: "amountCents must be a positive number" });
    return;
  }
  if (!Number.isInteger(amountCents)) {
    res.status(400).json({ error: "amountCents must be an integer" });
    return;
  }
  if (amountCents < 500) {
    res.status(400).json({ error: "Minimum withdrawal amount is $5 (500¢)" });
    return;
  }
  if (amountCents > 100_000) {
    res.status(400).json({ error: "Maximum withdrawal is $1,000 at a time" });
    return;
  }
  if (!paymentMethod || !ALLOWED_METHODS.includes(paymentMethod)) {
    res.status(400).json({ error: "paymentMethod must be PayPal, Bank Transfer, or USDT" });
    return;
  }

  // Method-specific validation
  if (paymentMethod === "USDT") {
    if (!usdtNetwork || !USDT_NETWORKS.includes(usdtNetwork)) {
      res.status(400).json({ error: "Network is required for USDT (TRC20, ERC20, or BEP20)" });
      return;
    }
    if (!usdtAddress || typeof usdtAddress !== "string" || !usdtAddress.trim()) {
      res.status(400).json({ error: "USDT wallet address is required" });
      return;
    }
  } else {
    if (!paymentDetails || typeof paymentDetails !== "string" || !paymentDetails.trim()) {
      res.status(400).json({ error: "paymentDetails is required" });
      return;
    }
    if (paymentMethod === "Bank Transfer") {
      if (!accountTitle || typeof accountTitle !== "string" || !accountTitle.trim()) {
        res.status(400).json({ error: "Account title is required for bank transfers" });
        return;
      }
      if (!bankName || typeof bankName !== "string" || !bankName.trim()) {
        res.status(400).json({ error: "Bank / Wallet Name is required for bank transfers" });
        return;
      }
    }
  }

  // ── 2. Identity verification — server-side, never trust the client ────────
  const [userRow] = await db
    .select({ verificationStatus: usersTable.verificationStatus })
    .from(usersTable)
    .where(eq(usersTable.clerkId, auth.userId));

  if (!userRow) {
    console.warn(`[security] Withdrawal attempt by unknown user ${auth.userId}`);
    res.status(403).json({ error: "User record not found.", code: "user_not_found" });
    return;
  }
  if (userRow.verificationStatus !== "approved") {
    console.warn(`[security] Unverified withdrawal attempt — user ${auth.userId} status=${userRow.verificationStatus}`);
    res.status(403).json({
      error: "Identity verification required before payout. Please upload your identity document in the Wallet page.",
      code: "verification_required",
      verificationStatus: userRow.verificationStatus,
    });
    return;
  }

  // ── 3. Block duplicate in-flight withdrawals ───────────────────────────────
  // If the user already has a pending or approved (awaiting transfer) withdrawal,
  // reject immediately — one request at a time.
  const [inflight] = await db
    .select({ id: transactionsTable.id, status: transactionsTable.status })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, auth.userId),
      eq(transactionsTable.type, "withdrawal"),
      sql`${transactionsTable.status} IN ('pending', 'approved')`,
    ))
    .limit(1);

  if (inflight) {
    console.warn(`[security] Duplicate withdrawal blocked — user ${auth.userId} already has ${inflight.status} withdrawal #${inflight.id}`);
    res.status(409).json({
      error: "You already have a withdrawal request in progress. Please wait for it to be processed before submitting a new one.",
      code: "withdrawal_in_progress",
    });
    return;
  }

  // ── 4. 24-hour cooldown between any withdrawals ────────────────────────────
  const cooldownStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recentWithdrawal] = await db
    .select({ id: transactionsTable.id, createdAt: transactionsTable.createdAt })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.userId, auth.userId),
      eq(transactionsTable.type, "withdrawal"),
      gt(transactionsTable.createdAt, cooldownStart),
    ))
    .limit(1);

  if (recentWithdrawal) {
    const nextAllowed = new Date((recentWithdrawal.createdAt as Date).getTime() + 24 * 60 * 60 * 1000);
    console.warn(`[security] Cooldown hit — user ${auth.userId} next allowed at ${nextAllowed.toISOString()}`);
    res.status(429).json({
      error: "You can only submit one withdrawal request per 24 hours.",
      code: "withdrawal_rate_limited",
      nextAllowedAt: nextAllowed.toISOString(),
    });
    return;
  }

  // ── 5. Server-side balance check with suspicious-activity logging ──────────
  // This is a pre-check for early rejection and logging. The actual race-safe
  // guard is the atomic UPDATE below; this layer only adds visibility.
  const [walletRow] = await db
    .select({ balanceCents: walletsTable.balanceCents })
    .from(walletsTable)
    .where(eq(walletsTable.userId, auth.userId));

  if (!walletRow) {
    res.status(400).json({ error: "Wallet not found" });
    return;
  }
  if (amountCents > walletRow.balanceCents) {
    console.warn(
      `[security] Over-balance withdrawal attempt — user ${auth.userId} requested ${amountCents}¢ but has only ${walletRow.balanceCents}¢`,
    );
    res.status(400).json({
      error: `Insufficient funds. Your current balance is ${walletRow.balanceCents}¢.`,
      code: "insufficient_funds",
    });
    return;
  }

  // ── 6. Atomic deduction — final race-safe guard ────────────────────────────
  // Only fires if balance is still sufficient at the DB level (handles race
  // conditions between the pre-check above and this UPDATE).
  const [deducted] = await db
    .update(walletsTable)
    .set({ balanceCents: sql`balance_cents - ${amountCents}` })
    .where(and(
      eq(walletsTable.userId, auth.userId),
      sql`balance_cents >= ${amountCents}`,
    ))
    .returning({ balanceCents: walletsTable.balanceCents });

  if (!deducted) {
    console.warn(`[security] Atomic deduction failed (race condition) — user ${auth.userId} requested ${amountCents}¢`);
    res.status(400).json({ error: "Insufficient funds. Please refresh and try again.", code: "insufficient_funds" });
    return;
  }

  // Build description and meta
  let description: string;
  let meta: Record<string, string> | null = null;

  if (paymentMethod === "USDT") {
    const trimmedAddress = usdtAddress.trim();
    description = `Withdrawal via USDT (Crypto) — ${usdtNetwork} · ${trimmedAddress.substring(0, 10)}…`;
    meta = {
      usdtNetwork,
      usdtAddress: trimmedAddress,
      ...(usdtOwnerName && typeof usdtOwnerName === "string" && usdtOwnerName.trim()
        ? { usdtOwnerName: usdtOwnerName.trim() }
        : {}),
    };
  } else {
    description = `Withdrawal via ${paymentMethod} — ${paymentDetails.trim().substring(0, 100)}`;
  }

  const [transaction] = await db.insert(transactionsTable).values({
    userId: auth.userId,
    type: "withdrawal",
    amountCents: -amountCents,
    description,
    status: "pending",
    accountTitle: paymentMethod === "Bank Transfer" ? accountTitle.trim() : null,
    bankName: paymentMethod === "Bank Transfer" ? bankName.trim() : null,
    meta,
  }).returning();

  // In-app notification confirming the request was received
  await db.insert(notificationsTable).values({
    userId: auth.userId,
    type: "withdrawal_submitted",
    title: "Withdrawal request submitted",
    message: "Your withdrawal request has been submitted and will be reviewed within 3 working days.",
    relatedId: transaction.id,
  }).then(() => notifCacheInvalidate(auth.userId!))
    .catch(err => console.error("[withdrawal] Failed to insert submission notification:", err));

  res.status(201).json(transaction);
});

export default router;
