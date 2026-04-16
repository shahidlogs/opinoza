import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable, walletsTable, answersTable, questionsTable, transactionsTable } from "@workspace/db";
import { eq, count, sum, and, gte, desc, ne, or, isNull } from "drizzle-orm";
import { sendEmail, welcomeEmail } from "../lib/email.js";
import { randomBytes } from "crypto";

const router: IRouter = Router();

// Profile fields eligible for a 1¢ reward — each rewarded only once
const PROFILE_REWARD_FIELDS = [
  { field: "name",     rewardedCol: "nameRewarded"     },
  { field: "city",     rewardedCol: "cityRewarded"     },
  { field: "ageGroup", rewardedCol: "ageGroupRewarded" },
  { field: "gender",   rewardedCol: "genderRewarded"   },
] as const;

function generateReferralCode(): string {
  return randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 8).padEnd(8, "X");
}

async function getOrCreateUser(clerkId: string, emailFromClaims: string, nameFromClaims?: string | null, signupIp?: string | null, signupUa?: string | null): Promise<{ user: typeof usersTable.$inferSelect; isNew: boolean }> {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  let isNew = false;
  if (!user) {
    isNew = true;
    // JWT claims may not include email (depends on Clerk config).
    // Always fetch authoritative user data directly from the Clerk API.
    let resolvedEmail = emailFromClaims;
    let resolvedName = nameFromClaims;
    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      resolvedEmail = clerkUser.emailAddresses[0]?.emailAddress || emailFromClaims;
      if (!resolvedName) {
        const first = clerkUser.firstName || "";
        const last = clerkUser.lastName || "";
        const full = [first, last].filter(Boolean).join(" ");
        resolvedName = full || clerkUser.username || null;
      }
    } catch (err) {
      console.warn("[users] Could not fetch user from Clerk API:", err);
    }

    // Generate a unique referral code with retry on collision
    let referralCode = generateReferralCode();
    let attempts = 0;
    while (attempts < 5) {
      const [existing] = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.referralCode, referralCode));
      if (!existing) break;
      referralCode = generateReferralCode();
      attempts++;
    }

    const [newUser] = await db.insert(usersTable).values({
      clerkId,
      email: resolvedEmail || "",
      name: resolvedName || null,
      isAdmin: false,
      referralCode,
      signupIp: signupIp || null,
      userAgent: signupUa || null,
    }).returning();
    user = newUser;

    // Send welcome email — fire-and-forget, never blocks the response
    if (resolvedEmail) {
      const mail = welcomeEmail({ name: resolvedName, email: resolvedEmail });
      sendEmail({ to: resolvedEmail, subject: mail.subject, html: mail.html, text: mail.text })
        .catch(err => console.error("[email] Welcome email error:", err));
    } else {
      console.warn(`[email] Skipping welcome email for ${clerkId} — no email address resolved`);
    }
  }

  // Backfill referral code for existing users who don't have one yet
  if (!user.referralCode) {
    let referralCode = generateReferralCode();
    let attempts = 0;
    while (attempts < 5) {
      const [existing] = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.referralCode, referralCode));
      if (!existing) break;
      referralCode = generateReferralCode();
      attempts++;
    }
    const [updated] = await db.update(usersTable).set({ referralCode }).where(eq(usersTable.clerkId, clerkId)).returning();
    user = updated;
  }

  // Always ensure wallet exists — runs for both new and existing users.
  // Uses ON CONFLICT DO NOTHING so it is safe to call on every login.
  await db.insert(walletsTable).values({ userId: clerkId }).onConflictDoNothing();

  return { user, isNew };
}

router.get("/users/me", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const emailFromClaims = (auth as any)?.sessionClaims?.email as string | undefined;
  const nameFromClaims = (auth as any)?.sessionClaims?.name as string | undefined;
  const signupIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || null;
  const signupUa = req.headers["user-agent"] || null;
  const { user, isNew } = await getOrCreateUser(auth.userId, emailFromClaims || "", nameFromClaims, signupIp, signupUa);
  res.json({
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    city: user.city,
    ageGroup: user.ageGroup,
    gender: user.gender,
    isAdmin: user.isAdmin,
    nameRewarded: user.nameRewarded,
    cityRewarded: user.cityRewarded,
    ageGroupRewarded: user.ageGroupRewarded,
    genderRewarded: user.genderRewarded,
    referralCode: user.referralCode,
    referredByUserId: user.referredByUserId,
    lastQuestionAt: user.lastQuestionAt ?? null,
    nameLocked: user.nameLocked,
    isNew,
    createdAt: user.createdAt,
  });
});

router.patch("/users/me", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, city, ageGroup, gender } = req.body;

  // Ensure user exists before patching
  let [existingUser] = await db.select().from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (!existingUser) {
    const emailFromClaims = (auth as any)?.sessionClaims?.email as string | undefined;
    const nameFromClaims = (auth as any)?.sessionClaims?.name as string | undefined;
    ({ user: existingUser } = await getOrCreateUser(auth.userId, emailFromClaims || "", nameFromClaims));
  }

  // Build field updates
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name?.trim() || null;
  if (city !== undefined) updates.city = city?.trim() || null;
  if (ageGroup !== undefined) updates.ageGroup = ageGroup || null;
  if (gender !== undefined) updates.gender = gender || null;

  // Rule 4: if name is locked, reject any attempt to change it (admin bypasses lock)
  if (updates.name !== undefined && existingUser.nameLocked && !existingUser.isAdmin) {
    res.status(403).json({
      error: "Your profile name is locked because you have reached $10 in lifetime earnings. Please contact support to update it.",
      code: "name_locked",
    });
    return;
  }

  // Determine which fields are being filled for the first time and haven't been rewarded yet
  const incomingValues: Record<string, string | null> = {
    name: updates.name ?? existingUser.name,
    city: updates.city ?? existingUser.city,
    ageGroup: updates.ageGroup ?? existingUser.ageGroup,
    gender: updates.gender ?? existingUser.gender,
  };

  const alreadyRewarded: Record<string, boolean> = {
    name: existingUser.nameRewarded,
    city: existingUser.cityRewarded,
    ageGroup: existingUser.ageGroupRewarded,
    gender: existingUser.genderRewarded,
  };

  const newlyEarned: string[] = [];
  for (const { field, rewardedCol } of PROFILE_REWARD_FIELDS) {
    const hasValue = !!incomingValues[field]?.trim();
    const notYetRewarded = !alreadyRewarded[field];
    if (hasValue && notYetRewarded) {
      newlyEarned.push(field);
      updates[rewardedCol] = true;
    }
  }

  // Apply updates
  const [user] = await db.update(usersTable)
    .set(updates)
    .where(eq(usersTable.clerkId, auth.userId))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Award 1¢ per newly completed profile field
  const earnedCents = newlyEarned.length;
  if (earnedCents > 0) {
    const FIELD_LABELS: Record<string, string> = {
      name: "Display Name",
      city: "City",
      ageGroup: "Age Group",
      gender: "Gender",
    };

    // Ensure wallet exists
    let [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, auth.userId));
    if (!wallet) {
      [wallet] = await db.insert(walletsTable).values({ userId: auth.userId }).returning();
    }

    // Credit wallet
    await db.update(walletsTable)
      .set({
        balanceCents: wallet.balanceCents + earnedCents,
        totalEarnedCents: wallet.totalEarnedCents + earnedCents,
      })
      .where(eq(walletsTable.userId, auth.userId));

    // Log one transaction per field
    for (const field of newlyEarned) {
      await db.insert(transactionsTable).values({
        userId: auth.userId,
        type: "profile_reward",
        amountCents: 1,
        description: `Profile reward: ${FIELD_LABELS[field] || field} completed`,
        status: "completed",
      });
    }
  }

  res.json({
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    city: user.city,
    ageGroup: user.ageGroup,
    gender: user.gender,
    isAdmin: user.isAdmin,
    nameRewarded: user.nameRewarded,
    cityRewarded: user.cityRewarded,
    ageGroupRewarded: user.ageGroupRewarded,
    genderRewarded: user.genderRewarded,
    nameLocked: user.nameLocked,
    createdAt: user.createdAt,
    earnedCents,
    newlyRewardedFields: newlyEarned,
  });
});

router.get("/users/me/stats", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const clerkId = auth.userId;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, clerkId));
  const [answerCount] = await db.select({ count: count() }).from(answersTable).where(and(
    eq(answersTable.userId, clerkId),
    or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
  ));
  const [questionCount] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.creatorId, clerkId));

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const [weeklyAnswers] = await db.select({ count: count() }).from(answersTable)
    .where(and(
      eq(answersTable.userId, clerkId),
      gte(answersTable.createdAt, weekAgo),
      or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
    ));

  const creatorBonusResult = await db.select({ total: sum(transactionsTable.amountCents) })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.userId, clerkId), eq(transactionsTable.type, "creator_reward")));
  const creatorBonusCents = Number(creatorBonusResult[0]?.total ?? 0);

  res.json({
    totalAnswers: Number(answerCount?.count ?? 0),
    questionsCreated: Number(questionCount?.count ?? 0),
    totalEarnedCents: wallet?.totalEarnedCents ?? 0,
    currentBalanceCents: wallet?.balanceCents ?? 0,
    creatorBonusCents,
    answersThisWeek: Number(weeklyAnswers?.count ?? 0),
  });
});

// User's own submitted questions
router.get("/users/me/questions", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const questions = await db.select().from(questionsTable)
    .where(eq(questionsTable.creatorId, auth.userId))
    .orderBy(desc(questionsTable.createdAt));

  res.json({ questions });
});

export default router;
