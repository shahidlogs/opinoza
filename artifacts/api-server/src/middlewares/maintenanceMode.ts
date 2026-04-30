import { type Request, type Response, type NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HEALTH_PATHS = new Set(["/healthz", "/api/healthz"]);

export function maintenanceMode(req: Request, res: Response, next: NextFunction): void {
  if (process.env.MAINTENANCE_MODE !== "true") {
    next();
    return;
  }

  if (HEALTH_PATHS.has(req.path) || HEALTH_PATHS.has(req.originalUrl.split("?")[0])) {
    next();
    return;
  }

  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  res.status(503).json({
    error: "maintenance_mode",
    message: "Opinoza is temporarily under maintenance. Please try again later.",
  });
}
