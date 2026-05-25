import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getMaintenanceActive } from "../lib/maintenanceSettings";

const HEALTH_PATHS = new Set(["/healthz", "/api/healthz"]);

async function isPrivilegedUser(req: Request): Promise<boolean> {
  try {
    const { userId } = getAuth(req);
    if (!userId) return false;
    const [user] = await db
      .select({ isAdmin: usersTable.isAdmin, isEditor: usersTable.isEditor })
      .from(usersTable)
      .where(eq(usersTable.clerkId, userId));
    return !!(user?.isAdmin || user?.isEditor);
  } catch {
    return false;
  }
}

export function maintenanceMode(req: Request, res: Response, next: NextFunction): void {
  const path = req.path || req.originalUrl.split("?")[0];

  // Always pass: health checks and the status endpoint
  if (HEALTH_PATHS.has(path) || path === "/maintenance-status" || path === "/api/maintenance-status") {
    next();
    return;
  }

  getMaintenanceActive()
    .then((active) => {
      if (!active) { next(); return; }

      // Maintenance is active — allow privileged users through
      return isPrivilegedUser(req).then((privileged) => {
        if (privileged) { next(); return; }
        res.status(503).json({
          error: "maintenance_mode",
          message: "Opinoza is under maintenance. We are upgrading the system and will be back soon.",
        });
      });
    })
    .catch(() => next()); // on unexpected error don't block the request
}
