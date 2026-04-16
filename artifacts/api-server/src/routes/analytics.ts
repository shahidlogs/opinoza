import { Router, type IRouter } from "express";
import { db, answersTable, usersTable, questionsTable } from "@workspace/db";
import { eq, count, desc, and, gte, ne, or, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/analytics/by-category", async (req, res): Promise<void> => {
  const { questionId } = req.query as Record<string, string>;

  let results;
  if (questionId) {
    const qId = parseInt(questionId, 10);
    const [question] = await db.select({ category: questionsTable.category }).from(questionsTable).where(eq(questionsTable.id, qId));
    const category = question?.category || "Unknown";
    results = [{ category, count: "1" }];
  } else {
    results = await db.select({
      category: questionsTable.category,
      count: count(),
    }).from(answersTable)
      .leftJoin(questionsTable, eq(answersTable.questionId, questionsTable.id))
      .groupBy(questionsTable.category)
      .orderBy(desc(count()));
  }

  const total = results.reduce((sum, r) => sum + Number(r.count), 0);
  const data = results.map(r => ({
    category: r.category || "Unknown",
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));

  res.json({ data });
});

router.get("/analytics/by-gender", async (req, res): Promise<void> => {
  const { questionId } = req.query as Record<string, string>;

  let results;
  if (questionId) {
    const qId = parseInt(questionId, 10);
    results = await db.select({
      gender: usersTable.gender,
      count: count(),
    }).from(answersTable)
      .leftJoin(usersTable, eq(answersTable.userId, usersTable.clerkId))
      .where(eq(answersTable.questionId, qId))
      .groupBy(usersTable.gender)
      .orderBy(desc(count()));
  } else {
    results = await db.select({
      gender: usersTable.gender,
      count: count(),
    }).from(answersTable)
      .leftJoin(usersTable, eq(answersTable.userId, usersTable.clerkId))
      .groupBy(usersTable.gender)
      .orderBy(desc(count()));
  }

  const total = results.reduce((sum, r) => sum + Number(r.count), 0);
  const data = results.map(r => ({
    gender: r.gender || "Not specified",
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));

  res.json({ data });
});

router.get("/analytics/by-age", async (req, res): Promise<void> => {
  const { questionId } = req.query as Record<string, string>;

  let results;
  if (questionId) {
    const qId = parseInt(questionId, 10);
    results = await db.select({
      ageGroup: usersTable.ageGroup,
      count: count(),
    }).from(answersTable)
      .leftJoin(usersTable, eq(answersTable.userId, usersTable.clerkId))
      .where(eq(answersTable.questionId, qId))
      .groupBy(usersTable.ageGroup)
      .orderBy(desc(count()));
  } else {
    results = await db.select({
      ageGroup: usersTable.ageGroup,
      count: count(),
    }).from(answersTable)
      .leftJoin(usersTable, eq(answersTable.userId, usersTable.clerkId))
      .groupBy(usersTable.ageGroup)
      .orderBy(desc(count()));
  }

  const total = results.reduce((sum, r) => sum + Number(r.count), 0);
  const data = results.map(r => ({
    ageGroup: r.ageGroup || "Not specified",
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));

  res.json({ data });
});

router.get("/analytics/by-city", async (req, res): Promise<void> => {
  const { questionId } = req.query as Record<string, string>;

  let results;
  if (questionId) {
    const qId = parseInt(questionId, 10);
    results = await db.select({
      city: usersTable.city,
      count: count(),
    }).from(answersTable)
      .leftJoin(usersTable, eq(answersTable.userId, usersTable.clerkId))
      .where(eq(answersTable.questionId, qId))
      .groupBy(usersTable.city)
      .orderBy(desc(count()));
  } else {
    results = await db.select({
      city: usersTable.city,
      count: count(),
    }).from(answersTable)
      .leftJoin(usersTable, eq(answersTable.userId, usersTable.clerkId))
      .groupBy(usersTable.city)
      .orderBy(desc(count()))
      .limit(10);
  }

  const total = results.reduce((sum, r) => sum + Number(r.count), 0);
  const data = results.map(r => ({
    city: r.city || "Unknown",
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));

  res.json({ data });
});

router.get("/analytics/platform-summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [todayAnswers] = await db.select({ count: count() }).from(answersTable).where(and(
    gte(answersTable.createdAt, today),
    or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
  ));
  const [weekAnswers] = await db.select({ count: count() }).from(answersTable).where(and(
    gte(answersTable.createdAt, weekAgo),
    or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")),
  ));
  const [activeQuestions] = await db.select({ count: count() }).from(questionsTable).where(eq(questionsTable.status, "active"));

  const categoryResults = await db.select({
    category: questionsTable.category,
    count: count(),
  }).from(answersTable)
    .leftJoin(questionsTable, eq(answersTable.questionId, questionsTable.id))
    .where(or(isNull(answersTable.flagStatus), ne(answersTable.flagStatus, "removed")))
    .groupBy(questionsTable.category)
    .orderBy(desc(count()))
    .limit(5);

  const totalCat = categoryResults.reduce((sum, r) => sum + Number(r.count), 0);
  const topCategories = categoryResults.map(r => ({
    category: r.category || "Unknown",
    count: Number(r.count),
    percentage: totalCat > 0 ? Math.round((Number(r.count) / totalCat) * 100) : 0,
  }));

  const recentQuestions = await db.select({
    title: questionsTable.title,
    totalAnswers: questionsTable.totalAnswers,
  }).from(questionsTable)
    .where(eq(questionsTable.status, "active"))
    .orderBy(desc(questionsTable.totalAnswers))
    .limit(5);

  const recentActivity = recentQuestions.map(q => ({
    questionTitle: q.title,
    answerCount: q.totalAnswers,
  }));

  const todayAnswerCents = Number(todayAnswers?.count ?? 0);

  res.json({
    totalAnswersToday: Number(todayAnswers?.count ?? 0),
    totalAnswersThisWeek: Number(weekAnswers?.count ?? 0),
    totalActiveQuestions: Number(activeQuestions?.count ?? 0),
    totalCentsEarnedToday: todayAnswerCents,
    topCategories,
    recentActivity,
  });
});

export default router;
