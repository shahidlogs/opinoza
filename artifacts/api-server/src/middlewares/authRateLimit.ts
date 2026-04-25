import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  return (
    (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * Loose limiter for Clerk auth proxy routes.
 * 100 requests per 15 minutes per IP — only stops extreme abuse,
 * never interferes with normal Google / social login flows.
 */
export const clerkAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: getClientIp,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      errors: [
        {
          code: "too_many_requests",
          message: "Too many requests. Please wait a few minutes and try again.",
          long_message:
            "You have made too many sign-in attempts. Please wait 15 minutes before trying again.",
          meta: {},
        },
      ],
      meta: { session_id: null },
    });
  },
  skip: (req) => req.method === "GET" || req.method === "HEAD",
});
