const NOTIF_CACHE_TTL_MS = 30_000;
const NOTIF_CACHE_MAX_SLOTS = 5000;
const notifCache = new Map<string, { data: unknown; expires: number }>();

export function notifCacheGet(userId: string): unknown | null {
  const e = notifCache.get(userId);
  if (!e || Date.now() > e.expires) { notifCache.delete(userId); return null; }
  return e.data;
}

export function notifCacheSet(userId: string, data: unknown): void {
  if (notifCache.size >= NOTIF_CACHE_MAX_SLOTS) notifCache.delete(notifCache.keys().next().value!);
  notifCache.set(userId, { data, expires: Date.now() + NOTIF_CACHE_TTL_MS });
}

export function notifCacheInvalidate(userId: string): void {
  notifCache.delete(userId);
}
