import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, walletsTable, transactionsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const ALLOWED_METHODS = ["PayPal", "Bank Transfer"] as const;

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

  res.json({
    id: wallet.id,
    userId: wallet.userId,
    balanceCents: wallet.balanceCents,
    totalEarnedCents: wallet.totalEarnedCents,
    totalWithdrawnCents: wallet.totalWithdrawnCents,
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

router.post("/wallet/withdraw", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { amountCents, paymentMethod, paymentDetails, accountTitle, bankName } = req.body;

  if (!amountCents || typeof amountCents !== "number" || amountCents <= 0) {
    res.status(400).json({ error: "amountCents must be a positive number" });
    return;
  }
  if (amountCents < 1000) {
    res.status(400).json({ error: "Minimum withdrawal amount is $10 (1000¢)" });
    return;
  }
  if (amountCents > 100_000) {
    res.status(400).json({ error: "Maximum withdrawal is $1,000 at a time" });
    return;
  }
  if (!paymentMethod || !ALLOWED_METHODS.includes(paymentMethod)) {
    res.status(400).json({ error: "paymentMethod must be PayPal or Bank Transfer" });
    return;
  }
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

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId));
  if (!wallet) {
    res.status(400).json({ error: "Wallet not found" });
    return;
  }
  if (wallet.balanceCents < amountCents) {
    res.status(400).json({ error: `Insufficient funds. Available: ${wallet.balanceCents}¢` });
    return;
  }

  // Deduct from available balance immediately (held pending admin approval)
  // totalWithdrawnCents is only updated when admin approves
  await db.update(walletsTable)
    .set({ balanceCents: wallet.balanceCents - amountCents })
    .where(eq(walletsTable.userId, auth.userId));

  const [transaction] = await db.insert(transactionsTable).values({
    userId: auth.userId,
    type: "withdrawal",
    amountCents: -amountCents,
    description: `Withdrawal via ${paymentMethod} — ${paymentDetails.trim().substring(0, 100)}`,
    status: "pending",
    accountTitle: paymentMethod === "Bank Transfer" ? accountTitle.trim() : null,
    bankName: paymentMethod === "Bank Transfer" ? bankName.trim() : null,
  }).returning();

  res.status(201).json(transaction);
});

export default router;
