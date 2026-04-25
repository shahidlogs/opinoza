/**
 * Local cache of Clerk 429 responses per client IP.
 *
 * When Clerk rate-limits an IP (returning 429 with a Retry-After header),
 * we store that fact in memory. Subsequent requests from the same IP during
 * the Retry-After window are answered immediately with 429 — WITHOUT forwarding
 * the request to Clerk. This stops the Clerk JS SDK's automatic retries from
 * burning more of the same IP's rate-limit budget, which would keep extending
 * the window and making the lock worse.
 *
 * Only applied to sign_ins and sign_ups (the endpoints Clerk rate-limits).
 * Token refreshes, touches, and all GETs are unaffected.
 */

import type { Request, Response, NextFunction } from "express";

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  return (
    (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

const cache = new Map<string, number>(); // ip → expiry unix ms

export function clerkRateLimitCache(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method === "GET" || req.method === "HEAD") {
    next();
    return;
  }
  const url = req.url ?? "";
  if (!url.includes("sign_in") && !url.includes("sign_up")) {
    next();
    return;
  }

  const ip = getClientIp(req);
  const expiry = cache.get(ip);
  if (expiry && expiry > Date.now()) {
    const remaining = Math.ceil((expiry - Date.now()) / 1000);
    res.setHeader("Retry-After", remaining);
    res.status(429).json({
      errors: [
        {
          code: "too_many_requests",
          message: `Too many requests. Please try again in ${remaining} seconds.`,
          long_message:
            "Authentication rate limit reached. Please wait before trying again.",
          meta: {},
        },
      ],
      meta: { session_id: null },
    });
    return;
  }
  next();
}

/**
 * Called by clerkProxyMiddleware when Clerk returns 429.
 * Records the IP + retryAfter so the cache middleware can short-circuit retries.
 */
export function recordClerkRateLimit(ip: string, retryAfterSecs: number): void {
  if (retryAfterSecs <= 0) return;
  const expiry = Date.now() + retryAfterSecs * 1000;
  cache.set(ip, expiry);
  setTimeout(() => cache.delete(ip), retryAfterSecs * 1000 + 5_000);
}
