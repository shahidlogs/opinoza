/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * See: https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 */

import { createProxyMiddleware } from "http-proxy-middleware";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../lib/logger";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

/**
 * Global auth rate-limit gate for sign_ups and sign_ins.
 *
 * ROOT CAUSE (confirmed from live logs, both endpoints):
 * Clerk applies the /v1/client/sign_ups AND /v1/client/sign_ins POST rate limits
 * per the TCP source IP reaching their servers — which is our proxy server's
 * outgoing IP, NOT per the client X-Forwarded-For IP. All users share one budget
 * per endpoint. Once exhausted, every subsequent attempt returns 429 from Clerk
 * until the window resets (~10 min).
 *
 * This gate stores a per-endpoint global expiry (ms). When set, any incoming
 * sign_ups or sign_ins POST is short-circuited with 429 immediately, without
 * forwarding to Clerk. Users still cannot authenticate during the window
 * (Clerk would reject them anyway), but:
 *   1. No wasted Clerk round-trip (~70 ms saved per blocked request)
 *   2. Spinner resolves immediately instead of after a full round-trip
 *   3. The rate-limit window is not extended by extra Clerk hits
 */
const globalAuthExpiry: Record<"sign_ups" | "sign_ins", number> = {
  sign_ups: 0,
  sign_ins: 0,
};

function endpointKey(url: string): "sign_ups" | "sign_ins" | null {
  if (url.includes("/v1/client/sign_ups")) return "sign_ups";
  if (url.includes("/v1/client/sign_ins")) return "sign_ins";
  return null;
}

function setGlobalAuthRateLimit(
  key: "sign_ups" | "sign_ins",
  retryAfterSecs: number,
): void {
  const expiry = Date.now() + retryAfterSecs * 1000;
  if (expiry > globalAuthExpiry[key]) {
    globalAuthExpiry[key] = expiry;
    logger.warn({
      msg: `[clerk-proxy] ${key} global rate-limit window recorded`,
      retryAfterSecs,
      expiresAt: new Date(expiry).toISOString(),
    });
  }
}

/**
 * Middleware mounted BEFORE clerkProxyMiddleware. Short-circuits sign_ups and
 * sign_ins requests while a known Clerk rate-limit window is still active.
 */
export function clerkSignupsGate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.method !== "POST") {
    next();
    return;
  }
  const key = endpointKey(req.url);
  if (!key) {
    next();
    return;
  }
  const expiry = globalAuthExpiry[key];
  if (expiry > Date.now()) {
    const remaining = Math.ceil((expiry - Date.now()) / 1000);
    logger.info({
      msg: `[clerk-proxy] ${key} blocked by global gate`,
      remainingSecs: remaining,
    });
    res.setHeader("Retry-After", remaining);
    res.status(429).json({
      errors: [
        {
          code: "too_many_requests",
          message: `Authentication is temporarily rate-limited. Please try again in ${remaining} seconds.`,
          long_message:
            "Authentication capacity is temporarily exhausted. Please try again shortly.",
          meta: {},
        },
      ],
      meta: { session_id: null },
    });
    return;
  }
  next();
}

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production — Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host || "";
        const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }

        if (req.method === "POST") {
          logger.info({
            msg: "[clerk-proxy] upstream request",
            method: req.method,
            path: req.url,
            proxyUrl,
            clientIp,
          });
        }
      },

      proxyRes: (proxyRes, req) => {
        if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
          const retryAfterRaw = proxyRes.headers["retry-after"];
          const retryAfterStr = Array.isArray(retryAfterRaw)
            ? retryAfterRaw[0]
            : retryAfterRaw;

          logger.warn({
            msg: "[clerk-proxy] upstream error",
            method: req.method,
            path: req.url,
            upstreamStatus: proxyRes.statusCode,
            retryAfter: retryAfterStr,
            rateLimitLimit: proxyRes.headers["x-ratelimit-limit"],
            rateLimitRemaining: proxyRes.headers["x-ratelimit-remaining"],
            rateLimitReset: proxyRes.headers["x-ratelimit-reset"],
            cfRay: proxyRes.headers["cf-ray"],
          });

          // When Clerk rate-limits sign_ups or sign_ins, record the window globally.
          // Both endpoints share one pool per server outgoing IP at Clerk (not per
          // client X-Forwarded-For). Caught by clerkSignupsGate on next attempt.
          if (proxyRes.statusCode === 429 && retryAfterStr) {
            const key = endpointKey(req.url);
            const secs = parseInt(retryAfterStr, 10);
            if (key && !isNaN(secs) && secs > 0) {
              setGlobalAuthRateLimit(key, secs);
            }
          }
        }
      },
    },
  }) as RequestHandler;
}
