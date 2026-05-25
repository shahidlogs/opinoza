import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const SETTING_KEY = "maintenance_mode";
const CACHE_TTL_MS = 5_000; // 5 s — changes propagate within 5 s, no restart needed

let _cache: { value: boolean; expiresAt: number } | null = null;

/**
 * Returns true when maintenance mode should be active.
 * Priority: env var (emergency override) > DB setting.
 * Result is cached for 5 s so the DB is not hit on every request.
 */
export async function getMaintenanceActive(): Promise<boolean> {
  // Env-var is the hard emergency override — always wins
  if (process.env.MAINTENANCE_MODE === "true") return true;

  // Serve from cache if still fresh
  if (_cache && Date.now() < _cache.expiresAt) return _cache.value;

  // Hit the DB
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, SETTING_KEY));
    const value = row?.value === "true";
    _cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    // If DB is unavailable fall back to env var only (already checked above → false)
    return false;
  }
}

/**
 * Persists the maintenance-mode setting to the DB and immediately
 * updates the in-process cache so the change takes effect within milliseconds.
 */
export async function setMaintenanceActive(
  active: boolean,
  adminClerkId: string,
): Promise<void> {
  await db
    .insert(systemSettingsTable)
    .values({ key: SETTING_KEY, value: String(active), updatedByClerkId: adminClerkId })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: String(active),
        updatedByClerkId: adminClerkId,
        updatedAt: new Date(),
      },
    });
  // Update cache immediately — no 5 s lag for the writing process
  _cache = { value: active, expiresAt: Date.now() + CACHE_TTL_MS };
}

/**
 * Returns whether the setting currently comes from the env-var override
 * so the admin UI can show a warning when the DB toggle is overridden.
 */
export function isEnvVarOverride(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}
