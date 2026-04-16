import { Router, type IRouter } from "express";
import { db, questionsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { seedStarterQuestions } from "../lib/seed";

const router: IRouter = Router();

router.post("/admin/seed", async (req, res) => {
  const token = req.headers["x-seed-token"] ?? req.query["token"];
  const expected = process.env["ADMIN_SEED_TOKEN"] ?? "earnqa-seed-2024";

  if (token !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [{ total: before }] = await db.select({ total: count() }).from(questionsTable);

    await seedStarterQuestions();

    const [{ total: after }] = await db.select({ total: count() }).from(questionsTable);

    res.json({
      success: true,
      before: Number(before),
      after: Number(after),
      inserted: Number(after) - Number(before),
      message: `Database now has ${after} questions.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? String(err) });
  }
});

router.get("/admin/seed/status", async (_req, res) => {
  try {
    const [{ total }] = await db.select({ total: count() }).from(questionsTable);
    res.json({ questions: Number(total) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

export default router;
