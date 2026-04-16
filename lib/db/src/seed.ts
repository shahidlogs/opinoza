/**
 * Database seed script — EarnQA starter questions
 * Run with: pnpm --filter @workspace/db run seed
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { questionsTable } from "./schema/questions";
import { eq, and } from "drizzle-orm";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const SEED_QUESTIONS = [
  // ── Profile ────────────────────────────────────────────────────────────────
  {
    title: "Which city or town do you currently live in?",
    description: "Tell us your city so we can surface location-based insights.",
    type: "short_answer",
    category: "Personal Profile",
  },
  {
    title: "What is your current occupation or job title?",
    description: "Describe your role in a few words (e.g. Software Engineer, Teacher, Student).",
    type: "short_answer",
    category: "Personal Profile",
  },
  {
    title: "What is your highest level of education?",
    description: "Select the highest academic level you have completed or are currently pursuing.",
    type: "poll",
    category: "Personal Profile",
    pollOptions: ["High School", "Some College", "Bachelor's Degree", "Master's Degree", "PhD / Doctorate", "Vocational / Trade", "Prefer not to say"],
  },
  {
    title: "What best describes your current employment status?",
    description: "Help us understand your working situation.",
    type: "poll",
    category: "Personal Profile",
    pollOptions: ["Employed full-time", "Employed part-time", "Self-employed / Freelance", "Student", "Unemployed", "Retired"],
  },

  // ── Preferences ────────────────────────────────────────────────────────────
  {
    title: "What is your all-time favorite movie or TV show?",
    description: "Don't overthink it — just the one that comes to mind first.",
    type: "short_answer",
    category: "Lifestyle",
  },
  {
    title: "What's your favorite type of food or cuisine?",
    description: "Italian, Japanese, Mexican, local street food — anything goes!",
    type: "short_answer",
    category: "Lifestyle",
  },
  {
    title: "Which app do you use the most every day?",
    description: "Think about the app you'd be lost without.",
    type: "short_answer",
    category: "Lifestyle",
  },
  {
    title: "Which smartphone brand do you prefer?",
    description: "If you had to pick just one brand for your next phone, which would it be?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Apple (iPhone)", "Samsung", "Xiaomi", "Google Pixel", "Huawei", "OnePlus", "Other"],
  },
  {
    title: "What is your favorite sport to watch or play?",
    description: "Name the sport you're most passionate about.",
    type: "short_answer",
    category: "Lifestyle",
  },
  {
    title: "What's your go-to daily drink?",
    description: "The beverage you reach for most often throughout the day.",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Coffee", "Tea", "Water", "Juice", "Soda / Fizzy drink", "Energy drink", "Milk"],
  },

  // ── Classic Polls ──────────────────────────────────────────────────────────
  {
    title: "Tea or Coffee — which do you prefer?",
    description: "The eternal debate. Which side are you on?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Tea ☕", "Coffee ☕", "Both equally", "Neither"],
  },
  {
    title: "Android or iPhone — which team are you on?",
    description: "When it comes to smartphones, there are two camps. Which is yours?",
    type: "poll",
    category: "Technology",
    pollOptions: ["Android 🤖", "iPhone 🍎", "I switch between both", "Neither / Other"],
  },
  {
    title: "Pepsi or Coca-Cola — which do you choose?",
    description: "Given a free can at a restaurant, which would you reach for?",
    type: "poll",
    category: "Food & Dining",
    pollOptions: ["Pepsi", "Coca-Cola", "I'd drink either", "Neither — I don't drink soda"],
  },
  {
    title: "Do you prefer online shopping or in-store shopping?",
    description: "When you need to buy something, what's your default approach?",
    type: "poll",
    category: "Shopping & Brands",
    pollOptions: ["Always online", "Always in-store", "Depends on what I'm buying", "About 50/50"],
  },
  {
    title: "Work from home or office — which do you prefer?",
    description: "If you had complete freedom to choose, where would you rather work?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Full remote (home)", "Full office", "Hybrid (mix of both)", "I'm a student / not applicable"],
  },
  {
    title: "Are you a morning person or a night owl?",
    description: "When do you feel most productive and energized?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Morning person 🌅", "Night owl 🦉", "Somewhere in between", "Depends on the day"],
  },
  {
    title: "iPhone or Android for your next phone?",
    description: "When your current phone dies tomorrow, which OS would you pick?",
    type: "poll",
    category: "Technology",
    pollOptions: ["iPhone (iOS)", "Android", "I haven't decided yet"],
  },

  // ── Product & Service Ratings ──────────────────────────────────────────────
  {
    title: "How would you rate Colgate toothpaste?",
    description: "Think about taste, effectiveness, and overall satisfaction.",
    type: "rating",
    category: "Health & Wellness",
  },
  {
    title: "Rate your KFC experience — food, service, and value",
    description: "Based on your most recent or typical visit to KFC.",
    type: "rating",
    category: "Food & Dining",
  },
  {
    title: "How do you rate your McDonald's experience?",
    description: "Overall rating for food quality, speed, and value for money.",
    type: "rating",
    category: "Food & Dining",
  },
  {
    title: "Rate your current mobile network provider",
    description: "Consider call quality, data speed, coverage, and customer service.",
    type: "rating",
    category: "Technology",
  },
  {
    title: "How would you rate Netflix as a streaming platform?",
    description: "Content library, interface, pricing, and overall value.",
    type: "rating",
    category: "Entertainment",
  },
  {
    title: "Rate Uber or a similar ride-hailing app in your city",
    description: "Consider driver quality, wait times, pricing, and app experience.",
    type: "rating",
    category: "Transport & Travel",
  },
  {
    title: "How satisfied are you with your home internet provider?",
    description: "Speed, reliability, customer support, and pricing.",
    type: "rating",
    category: "Technology",
  },
  {
    title: "Rate Amazon's shopping experience",
    description: "Delivery speed, product selection, pricing, and ease of use.",
    type: "rating",
    category: "Shopping & Brands",
  },
] as const;

async function seed() {
  console.log("🌱 Seeding EarnQA starter questions...\n");

  let added = 0;
  let skipped = 0;

  for (const q of SEED_QUESTIONS) {
    // Check for an existing question with the same title to avoid duplicates
    const [existing] = await db
      .select({ id: questionsTable.id })
      .from(questionsTable)
      .where(eq(questionsTable.title, q.title))
      .limit(1);

    if (existing) {
      console.log(`  ⏭  Skipping (exists): ${q.title}`);
      skipped++;
      continue;
    }

    await db.insert(questionsTable).values({
      title: q.title,
      description: q.description ?? null,
      type: q.type,
      category: q.category,
      status: "active",
      isCustom: false,
      creatorId: null,
      creatorName: null,
      pollOptions: "pollOptions" in q ? [...q.pollOptions] : null,
      totalAnswers: 0,
    });

    console.log(`  ✅ Added [${q.type.padEnd(12)}] [${q.category.padEnd(14)}] ${q.title}`);
    added++;
  }

  console.log(`\n✨ Done — ${added} questions added, ${skipped} skipped (already existed).`);
  await pool.end();
}

seed().catch(err => {
  console.error("❌ Seed failed:", err);
  pool.end();
  process.exit(1);
});
