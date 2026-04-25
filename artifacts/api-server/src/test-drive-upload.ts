/**
 * One-shot test runner: run a backup then upload to Google Drive.
 * Usage: node --enable-source-maps dist/test-drive-upload.mjs
 * This file is only for manual testing and is not imported by the server.
 */
import { runBackup } from "./lib/backup.js";

console.log("[test] Running end-to-end backup + Drive upload test...");
try {
  await runBackup();
  console.log("[test] SUCCESS — check Google Drive folder 'opinoza-backups'");
} catch (err) {
  console.error("[test] FAILED:", err);
  process.exit(1);
}
