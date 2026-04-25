/**
 * Database backup module — read-only, never modifies data.
 *
 * Runs pg_dump with --no-password and pipes output through gzip.
 * Backups are stored at BACKUP_DIR (default: /home/runner/workspace/.backups/db/).
 * Only the most recent MAX_BACKUPS files are kept; older files are deleted.
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
const MAX_BACKUPS = 7;

function timestamp(): string {
  const now = new Date();
  const YYYY = now.getUTCFullYear();
  const MM   = String(now.getUTCMonth() + 1).padStart(2, "0");
  const DD   = String(now.getUTCDate()).padStart(2, "0");
  const HH   = String(now.getUTCHours()).padStart(2, "0");
  const mm   = String(now.getUTCMinutes()).padStart(2, "0");
  return `${YYYY}-${MM}-${DD}_${HH}-${mm}`;
}

function pruneOldBackups(): void {
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

  if (files.length <= MAX_BACKUPS) return;

  const toDelete = files.slice(MAX_BACKUPS);
  for (const file of toDelete) {
    try {
      unlinkSync(join(BACKUP_DIR, file));
      logger.info(`[backup] Pruned old backup: ${file}`);
    } catch (err) {
      logger.warn({ err }, `[backup] Could not prune ${file}`);
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
    // Pass the full connection URI to pg_dump — it parses host/port/user/password
    // internally, so we never need to extract or echo individual credentials.
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
    const dest = createWriteStream(destPath, { flags: "wx" }); // wx = fail if exists

    pg.stdout!.pipe(gz).pipe(dest);

    let pgError: Error | null = null;

    pg.stderr!.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) logger.warn(`[backup] pg_dump stderr: ${msg}`);
    });

    pg.on("error", (err) => {
      pgError = err;
      gz.destroy();
      dest.destroy();
      reject(err);
    });

    pg.on("close", (code) => {
      if (code !== 0 && !pgError) {
        const err = new Error(`pg_dump exited with code ${code}`);
        gz.destroy();
        dest.destroy();
        reject(err);
      }
    });

    dest.on("finish", () => {
      if (!pgError) {
        const sizeKB = Math.round(statSync(destPath).size / 1024);
        logger.info(`[backup] Backup complete: ${filename} (${sizeKB} KB)`);
        resolve();
      }
    });

    dest.on("error", (err) => {
      pg.kill();
      reject(err);
    });
  });

  pruneOldBackups();

  // Off-site copy: upload to Google Drive after local backup is confirmed complete.
  // Failure here is non-fatal — the local backup is already safe.
  try {
    await uploadBackupToDrive(destPath);
  } catch (err) {
    logger.error({ err }, "[backup] Google Drive upload failed — local backup is intact");
  }
}

export function scheduleBackup(): void {
  // Run once daily at 02:00 UTC
  cron.schedule("0 2 * * *", () => {
    runBackup().catch(err => logger.error({ err }, "[backup] Daily backup failed"));
  }, { timezone: "UTC" });

  logger.info("[backup] Daily backup scheduler registered — runs at 02:00 UTC");
}
