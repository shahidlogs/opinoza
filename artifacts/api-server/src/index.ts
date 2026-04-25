import app from "./app";
import { logger } from "./lib/logger";
import { migrateCategories } from "./lib/migrate-categories";
import { seedStarterQuestions } from "./lib/seed";
import { backfillApproveReferrals } from "./lib/backfill";
import { backfillLang } from "./lib/backfillLang";
import { ensureIndexes } from "./lib/ensureIndexes";
import { scheduleBackup } from "./lib/backup.js";
import { scheduleEngagementPush } from "./lib/daily-engagement.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

migrateCategories()
  .catch(err => logger.error({ err }, "Category migration failed"))
  .then(() => seedStarterQuestions())
  .catch(err => logger.error({ err }, "Seed step failed"))
  .then(() => backfillApproveReferrals())
  .catch(err => logger.error({ err }, "Referral backfill failed"))
  .then(() => backfillLang())
  .catch(err => logger.error({ err }, "Lang backfill failed"))
  .then(() => ensureIndexes())
  .catch(err => logger.error({ err }, "Index setup failed"))
  .finally(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");

      scheduleBackup();
      scheduleEngagementPush();
    });
  });
