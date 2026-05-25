import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * GET /maintenance-status
 * Always exempt from the maintenance-mode middleware.
 * Returns { active: true } when the site is in maintenance AND the caller is
 * not an admin/editor; { active: false } otherwise.
 * The frontend polls this to decide whether to show the maintenance page.
 */
router.get("/maintenance-status", async (req, res): Promise<void> => {
  if (process.env.MAINTENANCE_MODE !== "true") {
    res.json({ active: false });
    return;
  }

  // Check if the caller is a privileged user
  try {
    const { userId } = getAuth(req);
    if (userId) {
      const [user] = await db
        .select({ isAdmin: usersTable.isAdmin, isEditor: usersTable.isEditor })
        .from(usersTable)
        .where(eq(usersTable.clerkId, userId));
      if (user?.isAdmin || user?.isEditor) {
        res.json({ active: false });
        return;
      }
    }
  } catch {
    // On error, default to showing maintenance to be safe
  }

  res.json({ active: true });
});

export default router;
