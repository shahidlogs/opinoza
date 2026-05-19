/**
 * Database backup module — read-only, never modifies data.
 *
 * Runs pg_dump with --no-password and pipes output through gzip.
 * Backups are stored at BACKUP_DIR (default: /home/runner/workspace/.backups/db/).
 *
 * Two trigger mechanisms:
 *  1. checkAndRunStartupBackup() — called at server startup; runs immediately if
 *     the most recent local backup is older than STARTUP_BACKUP_MIN_AGE_HOURS.
 *     This is the primary trigger because production containers are frequently
 *     redeployed before the 02:00 UTC cron window is reached.
 *  2. scheduleBackup() — registers a node-cron job at 02:00 UTC as a fallback
 *     for containers that stay alive for >24 h.
 *
 * Local retention: keep the most recent MAX_LOCAL_BACKUPS files.
 * Drive retention: managed by uploadBackupToDrive() in drive-upload.ts.
 */

import { execFile } from "child_process";
import { createWriteStream, readdirSync, statSync, unlinkSync } from "fs";
import { mkdir } from "fs/promises";
import { createGzip } from "zlib";
import { join } from "path";
import cron from "node-cron";
import { logger } from "./logger.js";
import { uploadBackupToDrive } from "./drive-upload.js";

const BACKUP_DIR = join(process.cwd(), "../../.backups/db");
const MAX_LOCAL_BACKUPS = 5;
const STARTUP_BACKUP_MIN_AGE_HOURS = 12;

function timestamp(): string {
  const now = new Date();
  const YYYY = now.getUTCFullYear();
  const MM   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const DD   = String(now.getUTCDate()).padStart(2, "0");
  const HH   = String(now.getUTCHours()).padStart(2, "0");
  const mm   = String(now.getUTCMinutes()).padStart(2, "0");
  return `${YYYY}-${MM}-${DD}_${HH}-${mm}`;
}

/**
 * Returns the age of the most recent local backup in hours,
 * or Infinity if no backups exist.
 */
function latestLocalBackupAgeHours(): number {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("opinoza_") && f.endsWith(".sql.gz"));
    if (files.length === 0) return Infinity;
    const latestMtime = Math.max(
      ...files.map(f => statSync(join(BACKUP_DIR, f)).mtimeMs),
    );
    return (Date.now() - latestMtime) / (1000 * 60 * 60);
  } catch {
    return Infinity;
  }
}

function pruneLocalBackups(): void {
  let files: string[];
  try {
    files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("opinoza_") && f.endsWith(".sql.gz"))
      .map(f => ({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .map(f => f.name);
  } catch {
    return;
  }

  if (files.length <= MAX_LOCAL_BACKUPS) return;

  const toDelete = files.slice(MAX_LOCAL_BACKUPS);
  for (const file of toDelete) {
    try {
      unlinkSync(join(BACKUP_DIR, file));
      logger.info(`[backup] Pruned old local backup: ${file}`);
    } catch (err) {
      logger.warn({ err }, `[backup] Could not prune local backup: ${file}`);
    }
  }
}

export async function runBackup(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    logger.error("[backup] DATABASE_URL not set — skipping backup");
    return;
  }

  await mkdir(BACKUP_DIR, { recursive: true });

  const filename = `opinoza_${timestamp()}.sql.gz`;
  const destPath = join(BACKUP_DIR, filename);

  logger.info(`[backup] Starting backup → ${filename}`);

  await new Promise<void>((resolve, reject) => {
    const pg = execFile(
      "pg_dump",
      [
        `--dbname=${databaseUrl}`,
        "--no-password",
        "--format=plain",
        "--no-owner",
        "--no-acl",
      ],
      { env: process.env, maxBuffer: 512 * 1024 * 1024 },
    );

    const gz   = createGzip({ level: 9 });
    const dest = createWriteStream(destPath, { flags: "wx" });

    pg.stdout!.pipe(gz).pipe(dest);

    let pgError: Error | null = null;
    let pgStderrLines: string[] = [];

    pg.stderr!.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        pgStderrLines.push(msg);
        logger.warn(`[backup] pg_dump stderr: ${msg}`);
      }
    });

    pg.on("error", (err) => {
      pgError = err;
      gz.destroy();
      dest.destroy();
      logger.error({ err }, "[backup] pg_dump process error — backup aborted");
      reject(err);
    });

    pg.on("close", (code) => {
      if (code !== 0 && !pgError) {
        const detail = pgStderrLines.join(" | ") || "(no stderr)";
        const err = new Error(`pg_dump exited with code ${code}: ${detail}`);
        gz.destroy();
        dest.destroy();
        logger.error({ code, detail }, "[backup] pg_dump exited with non-zero code");
        reject(err);
      }
    });

    dest.on("finish", () => {
      if (!pgError) {
        const sizeKB = Math.round(statSync(destPath).size / 1024);
        logger.info(`[backup] Local backup complete: ${filename} (${sizeKB} KB)`);
        resolve();
      }
    });

    dest.on("error", (err) => {
      pg.kill();
      logger.error({ err }, `[backup] Write error for ${filename}`);
      reject(err);
    });
  });

  pruneLocalBackups();

  try {
    await uploadBackupToDrive(destPath, filename);
  } catch (err) {
    logger.error(
      { err },
      "[backup] Google Drive upload failed — local backup is intact but off-site copy is missing",
    );
  }
}

/**
 * Called at server startup.
 * Runs a fresh backup immediately if the most recent local backup
 * is older than STARTUP_BACKUP_MIN_AGE_HOURS (default 12 h).
 *
 * This is the primary backup trigger because production containers
 * are frequently redeployed before the 02:00 UTC cron window is reached.
 */
export async function checkAndRunStartupBackup(): Promise<void> {
  const ageHours = latestLocalBackupAgeHours();

  if (ageHours >= STARTUP_BACKUP_MIN_AGE_HOURS) {
    logger.info(
      { ageHours: Math.round(ageHours) },
      "[backup] Startup check: last backup is old — running backup now",
    );
    await runBackup();
  } else {
    logger.info(
      { ageHours: Math.round(ageHours * 10) / 10 },
      "[backup] Startup check: recent backup exists — skipping startup backup",
    );
  }
}

/**
 * Registers a node-cron job to run a backup every day at 02:00 UTC.
 * Acts as a fallback for containers that remain alive for >24 h.
 * The startup check handles the common case of frequent redeployments.
 */
export function scheduleBackup(): void {
  cron.schedule("0 2 * * *", () => {
    logger.info("[backup] Cron triggered — starting scheduled backup");
    runBackup().catch(err => logger.error({ err }, "[backup] Scheduled backup failed"));
  }, { timezone: "UTC" });

  logger.info("[backup] Daily backup scheduler registered — runs at 02:00 UTC");
}
