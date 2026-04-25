import type { Request } from "express";

export function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? null;
}
