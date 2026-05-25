import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getMaintenanceActive, isEnvVarOverride } from "../lib/maintenanceSettings";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * GET /maintenance-status
 * Always exempt from the maintenance-mode middleware.
 * Returns { active: boolean } — true means the caller should see the
 * maintenance page; false means they can proceed normally.
 * Admins and editors always receive { active: false }.
 */
router.get("/maintenance-status", async (req, res): Promise<void> => {
  const active = await getMaintenanceActive();

  if (!active) {
    res.json({ active: false });
    return;
  }

  // Maintenance is on — check if the caller is privileged
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
    // On error, default to showing maintenance (safe)
  }

  res.json({ active: true, envOverride: isEnvVarOverride() });
});

export default router;
