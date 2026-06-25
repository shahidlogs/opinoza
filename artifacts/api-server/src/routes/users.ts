import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { attachPreviews } from "../lib/preview.js";
import { db, usersTable, walletsTable, answersTable, questionsTable, transactionsTable, referralsTable, referralClicksTable, notificationsTable, pushNotificationLogsTable } from "@workspace/db";
import { eq, count, sum, and, gte, desc, ne, or, isNull, sql, inArray } from "drizzle-orm";
import { sendEmail, welcomeEmail } from "../lib/email.js";
import { randomBytes } from "crypto";
import { uploadIdDocumentToDrive } from "../lib/drive-upload.js";
import { checkIpBan, IP_BAN_MESSAGE } from "../lib/banCheck";
import { getClientIp } from "../lib/clientIp";

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
    // JWT claims may not include email (depends on Clerk config).
    // Always fetch authoritative user data directly from the Clerk API.
    // Done here (before the re-link check) so both paths share the same fetch.
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

    // ── Clerk tenant migration re-link ────────────────────────────────────────
    // When switching Clerk tenants (e.g. external → Replit-managed), the same
    // email address gets a brand-new clerkId. Without this block every existing
    // user's row — along with their wallet, answers, questions, transactions,
    // and referrals — would be orphaned while a blank new row was created.
    //
    // Strategy: if an existing, non-deleted user already has this email, we
    // atomically rewrite the old clerkId to the new one across every table that
    // stores it, then return that row as an existing (isNew=false) user so no
    // welcome email is sent and no data is lost.
    if (resolvedEmail) {
      const [existingByEmail] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.email, resolvedEmail), eq(usersTable.isDeleted, false)));

      if (existingByEmail) {
        const oldClerkId = existingByEmail.clerkId;
        // Atomically rewrite every clerkId reference. Child tables are updated
        // before users so no unique-constraint violation can occur mid-transaction.
        const [relinked] = await db.transaction(async (tx) => {
          await tx.update(walletsTable)
            .set({ userId: clerkId }).where(eq(walletsTable.userId, oldClerkId));
          await tx.update(answersTable)
            .set({ userId: clerkId }).where(eq(answersTable.userId, oldClerkId));
          await tx.update(transactionsTable)
            .set({ userId: clerkId }).where(eq(transactionsTable.userId, oldClerkId));
          await tx.update(questionsTable)
            .set({ creatorId: clerkId }).where(eq(questionsTable.creatorId, oldClerkId));
          await tx.update(referralsTable)
            .set({ referrerUserId: clerkId }).where(eq(referralsTable.referrerUserId, oldClerkId));
          await tx.update(referralsTable)
            .set({ referredUserId: clerkId }).where(eq(referralsTable.referredUserId, oldClerkId));
          await tx.update(referralClicksTable)
            .set({ referrerUserId: clerkId }).where(eq(referralClicksTable.referrerUserId, oldClerkId));
          await tx.update(notificationsTable)
            .set({ userId: clerkId }).where(eq(notificationsTable.userId, oldClerkId));
          await tx.update(pushNotificationLogsTable)
            .set({ userId: clerkId }).where(eq(pushNotificationLogsTable.userId, oldClerkId));
          // users.clerk_id updated last — other tables reference it conceptually
          return tx
            .update(usersTable)
            .set({ clerkId })
            .where(eq(usersTable.clerkId, oldClerkId))
            .returning();
        });
        console.info(`[users] Re-linked clerkId for ${resolvedEmail}: ${oldClerkId} → ${clerkId}`);
        user = relinked;
        // isNew stays false — fall through to referralCode backfill + wallet ensure
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Only create a fresh account when the email re-link found no match
    if (!user) {
      isNew = true;

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

  // Block banned IPs from accessing the platform (prevents evading user bans via new accounts)
  const clientIp = getClientIp(req);
  if (await checkIpBan(clientIp)) {
    res.status(403).json({ error: IP_BAN_MESSAGE, code: "ip_banned" });
    return;
  }

  const emailFromClaims = (auth as any)?.sessionClaims?.email as string | undefined;
  const nameFromClaims = (auth as any)?.sessionClaims?.name as string | undefined;
  const signupIp = clientIp;
  const signupUa = req.headers["user-agent"] || null;
  const { user, isNew } = await getOrCreateUser(auth.userId, emailFromClaims || "", nameFromClaims, signupIp, signupUa);

  // Block deleted accounts from logging in
  if (user.isDeleted) {
    res.status(403).json({ error: "This account has been deleted and cannot be used again.", code: "account_deleted" });
    return;
  }

  // Block new signups that reuse the same email as a deleted account
  if (isNew && user.email) {
    const [deletedWithSameEmail] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, user.email), eq(usersTable.isDeleted, true), ne(usersTable.clerkId, auth.userId)));
    if (deletedWithSameEmail) {
      await db.update(usersTable)
        .set({ isDeleted: true, deletedAt: new Date(), deletionReason: "email_reuse_blocked" })
        .where(eq(usersTable.clerkId, auth.userId));
      res.status(403).json({ error: "This account has been deleted and cannot be used again.", code: "account_deleted" });
      return;
    }
  }

  // Update lastIp on every login (best-effort; helps admin identify IPs)
  if (clientIp) {
    db.update(usersTable).set({ lastIp: clientIp }).where(eq(usersTable.clerkId, auth.userId))
      .catch(err => console.error("[users] Failed to update lastIp:", err));
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
    isEditor: user.isEditor,
    nameRewarded: user.nameRewarded,
    cityRewarded: user.cityRewarded,
    ageGroupRewarded: user.ageGroupRewarded,
    genderRewarded: user.genderRewarded,
    phoneNumber: user.phoneNumber ?? null,
    referralCode: user.referralCode,
    referredByUserId: user.referredByUserId,
    lastQuestionAt: user.lastQuestionAt ?? null,
    nameLocked: user.nameLocked,
    verificationStatus: user.verificationStatus,
    verifiedName: user.verifiedName ?? null,
    idDocumentType: user.idDocumentType ?? null,
    verificationRejectionReason: user.verificationRejectionReason ?? null,
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

  const { name, city, ageGroup, gender, phoneNumber } = req.body;

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
  if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber?.trim() || null;

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

    // Atomic upsert — race-safe regardless of concurrent requests
    await db.insert(walletsTable)
      .values({ userId: auth.userId, balanceCents: earnedCents, totalEarnedCents: earnedCents })
      .onConflictDoUpdate({
        target: walletsTable.userId,
        set: {
          balanceCents: sql`wallets.balance_cents + ${earnedCents}`,
          totalEarnedCents: sql`wallets.total_earned_cents + ${earnedCents}`,
        },
      });

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
    phoneNumber: user.phoneNumber ?? null,
    isAdmin: user.isAdmin,
    isEditor: user.isEditor,
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

  const base = await db.select().from(questionsTable)
    .where(eq(questionsTable.creatorId, auth.userId))
    .orderBy(desc(questionsTable.createdAt));

  const questions = await attachPreviews(base);
  res.json({ questions });
});

// ── Identity Verification ──────────────────────────────────────────────────

// GET /users/me/verification — returns current verification status for the user
router.get("/users/me/verification", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select({
    verificationStatus: usersTable.verificationStatus,
    verifiedName: usersTable.verifiedName,
    idDocumentType: usersTable.idDocumentType,
    verificationRejectionReason: usersTable.verificationRejectionReason,
    verificationReviewedAt: usersTable.verificationReviewedAt,
  }).from(usersTable).where(eq(usersTable.clerkId, auth.userId));

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  res.json({
    verificationStatus: user.verificationStatus,
    verifiedName: user.verifiedName ?? null,
    idDocumentType: user.idDocumentType ?? null,
    verificationRejectionReason: user.verificationRejectionReason ?? null,
    verificationReviewedAt: user.verificationReviewedAt ?? null,
  });
});

// POST /users/me/verification — submit identity document for verification
// Body: { documentType, verifiedName, documentBase64, documentMimeType, documentFilename }
const ACCEPTED_DOC_TYPES = [
  "National ID / CNIC",
  "Driving License",
  "Passport",
  "Student Card / Student ID",
  "Other valid ID",
] as const;

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

const ACCEPTED_MIME_LABEL = "JPG, PNG, WebP, HEIC or PDF";

router.post("/users/me/verification", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  if (!auth?.userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { documentType, verifiedName, documentBase64, documentMimeType, documentFilename } = req.body;

  if (!documentType || !ACCEPTED_DOC_TYPES.includes(documentType)) {
    res.status(400).json({ error: `documentType must be one of: ${ACCEPTED_DOC_TYPES.join(", ")}` });
    return;
  }
  if (!verifiedName || typeof verifiedName !== "string" || !verifiedName.trim()) {
    res.status(400).json({ error: "verifiedName (name as it appears on your ID) is required" });
    return;
  }
  if (!documentBase64 || typeof documentBase64 !== "string") {
    res.status(400).json({ error: "documentBase64 is required" });
    return;
  }
  if (!documentMimeType || !ACCEPTED_MIME_TYPES.includes(documentMimeType)) {
    res.status(400).json({
      error: `Unsupported file type: "${documentMimeType || "unknown"}". Accepted formats: ${ACCEPTED_MIME_LABEL}.`,
    });
    return;
  }

  // Check current status — don't allow re-upload if already approved
  const [existingUser] = await db.select({ verificationStatus: usersTable.verificationStatus })
    .from(usersTable).where(eq(usersTable.clerkId, auth.userId));
  if (existingUser?.verificationStatus === "approved") {
    res.status(409).json({ error: "Your identity is already verified." });
    return;
  }

  // Decode base64 and upload to Google Drive
  let fileId: string;
  try {
    const fileBuffer = Buffer.from(documentBase64, "base64");
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(1);
    if (fileBuffer.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: `Document too large (${fileSizeMB} MB). Maximum 10 MB. Please compress the image or use a smaller file.` });
      return;
    }
    const filename = documentFilename || `document.${documentMimeType.split("/")[1] || "jpg"}`;
    const result = await uploadIdDocumentToDrive(auth.userId, fileBuffer, documentMimeType, filename);
    fileId = result.fileId;
  } catch (err) {
    console.error("[verification] Drive upload failed:", err);
    res.status(500).json({ error: "Failed to upload document. Please try again." });
    return;
  }

  await db.update(usersTable).set({
    verificationStatus: "pending",
    verifiedName: verifiedName.trim(),
    idDocumentType: documentType,
    idDocumentPath: fileId,
    verificationRejectionReason: null,
    verificationReviewedBy: null,
    verificationReviewedAt: null,
  }).where(eq(usersTable.clerkId, auth.userId));

  res.status(201).json({
    verificationStatus: "pending",
    message: "Your identity document has been submitted for review. We will notify you once it is verified.",
  });
});

// ─── Public Profile (no auth required) ───────────────────────────────────────
router.get("/users/:id/public", async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    clerkId: usersTable.clerkId,
    name: usersTable.name,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, userId));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Approved questions created by this user
  const questions = await db.select({
    id: questionsTable.id,
    title: questionsTable.title,
    description: questionsTable.description,
    type: questionsTable.type,
    categories: questionsTable.categories,
    totalAnswers: questionsTable.totalAnswers,
    createdAt: questionsTable.createdAt,
    pollOptions: questionsTable.pollOptions,
  }).from(questionsTable)
    .where(and(
      eq(questionsTable.creatorId, user.clerkId),
      eq(questionsTable.status, "active"),
    ))
    .orderBy(desc(questionsTable.createdAt));

  // Total answers received across all their active questions
  let totalAnswersReceived = 0;
  if (questions.length > 0) {
    const qIds = questions.map(q => q.id);
    const [{ total }] = await db.select({ total: sum(questionsTable.totalAnswers) })
      .from(questionsTable)
      .where(inArray(questionsTable.id, qIds));
    totalAnswersReceived = Number(total ?? 0);
  }

  // Total non-rejected referrals made by this user
  const [{ invited }] = await db.select({ invited: count() })
    .from(referralsTable)
    .where(and(
      eq(referralsTable.referrerUserId, user.clerkId),
      ne(referralsTable.status, "rejected"),
    ));

  // Format joined date as "Month YYYY"
  const joinedDate = new Date(user.createdAt);
  const joinedLabel = joinedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  res.json({
    id: user.id,
    displayName: user.name || "Anonymous",
    joinedLabel,
    approvedQuestionsCount: questions.length,
    totalAnswersReceived,
    totalInvited: Number(invited),
    questions,
  });
});

export default router;
