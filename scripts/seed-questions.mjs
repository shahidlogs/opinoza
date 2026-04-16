/**
 * EarnQA — Database seed script (pure ESM JavaScript, no TypeScript)
 * Run with: node scripts/seed-questions.mjs
 */

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const QUESTIONS = [
  // ── Profile ──────────────────────────────────────────────────────────────
  {
    title: "Which city or town do you currently live in?",
    description: "Tell us your city so we can surface location-based insights.",
    type: "short_answer",
    category: "Profile",
    poll_options: null,
  },
  {
    title: "What is your current occupation or job title?",
    description: "Describe your role in a few words (e.g. Software Engineer, Teacher, Student).",
    type: "short_answer",
    category: "Profile",
    poll_options: null,
  },
  {
    title: "What is your highest level of education?",
    description: "Select the highest academic level you have completed or are currently pursuing.",
    type: "poll",
    category: "Profile",
    poll_options: ["High School", "Some College", "Bachelor's Degree", "Master's Degree", "PhD / Doctorate", "Vocational / Trade", "Prefer not to say"],
  },
  {
    title: "What best describes your current employment status?",
    description: "Help us understand your working situation.",
    type: "poll",
    category: "Profile",
    poll_options: ["Employed full-time", "Employed part-time", "Self-employed / Freelance", "Student", "Unemployed", "Retired"],
  },

  // ── Preferences ──────────────────────────────────────────────────────────
  {
    title: "What is your all-time favorite movie or TV show?",
    description: "Don't overthink it — just the one that comes to mind first.",
    type: "short_answer",
    category: "Preferences",
    poll_options: null,
  },
  {
    title: "What's your favorite type of food or cuisine?",
    description: "Italian, Japanese, Mexican, local street food — anything goes!",
    type: "short_answer",
    category: "Preferences",
    poll_options: null,
  },
  {
    title: "Which app do you use the most every day?",
    description: "Think about the app you'd be lost without.",
    type: "short_answer",
    category: "Preferences",
    poll_options: null,
  },
  {
    title: "Which smartphone brand do you prefer?",
    description: "If you had to pick just one brand for your next phone, which would it be?",
    type: "poll",
    category: "Preferences",
    poll_options: ["Apple (iPhone)", "Samsung", "Xiaomi", "Google Pixel", "Huawei", "OnePlus", "Other"],
  },
  {
    title: "What is your favorite sport to watch or play?",
    description: "Name the sport you're most passionate about.",
    type: "short_answer",
    category: "Preferences",
    poll_options: null,
  },
  {
    title: "What's your go-to daily drink?",
    description: "The beverage you reach for most often throughout the day.",
    type: "poll",
    category: "Preferences",
    poll_options: ["Coffee", "Tea", "Water", "Juice", "Soda / Fizzy drink", "Energy drink", "Milk"],
  },

  // ── Lifestyle Polls ───────────────────────────────────────────────────────
  {
    title: "Tea or Coffee — which do you prefer?",
    description: "The eternal debate. Which side are you on?",
    type: "poll",
    category: "Lifestyle",
    poll_options: ["Tea ☕", "Coffee ☕", "Both equally", "Neither"],
  },
  {
    title: "Do you prefer online shopping or in-store shopping?",
    description: "When you need to buy something, what's your default approach?",
    type: "poll",
    category: "Shopping",
    poll_options: ["Always online", "Always in-store", "Depends on what I'm buying", "About 50/50"],
  },
  {
    title: "Work from home or office — which do you prefer?",
    description: "If you had complete freedom to choose, where would you rather work?",
    type: "poll",
    category: "Lifestyle",
    poll_options: ["Full remote (home)", "Full office", "Hybrid (mix of both)", "I'm a student / not applicable"],
  },
  {
    title: "Are you a morning person or a night owl?",
    description: "When do you feel most productive and energized?",
    type: "poll",
    category: "Lifestyle",
    poll_options: ["Morning person 🌅", "Night owl 🦉", "Somewhere in between", "Depends on the day"],
  },
  {
    title: "Android or iPhone — which team are you on?",
    description: "When it comes to smartphones, there are two camps. Which is yours?",
    type: "poll",
    category: "Technology",
    poll_options: ["Android 🤖", "iPhone 🍎", "I switch between both", "Neither / Other"],
  },
  {
    title: "Pepsi or Coca-Cola — which do you choose?",
    description: "Given a free can at a restaurant, which would you reach for?",
    type: "poll",
    category: "Food & Dining",
    poll_options: ["Pepsi", "Coca-Cola", "I'd drink either", "Neither — I don't drink soda"],
  },
  {
    title: "Which social media platform do you enjoy most?",
    description: "The one you'd keep if you could only use a single platform.",
    type: "poll",
    category: "Technology",
    poll_options: ["Instagram", "TikTok", "YouTube", "X (Twitter)", "Facebook", "LinkedIn", "Snapchat", "Other"],
  },
  {
    title: "Cat person or dog person?",
    description: "If you had to pick just one as a pet, which would you choose?",
    type: "poll",
    category: "Lifestyle",
    poll_options: ["Cat 🐱", "Dog 🐶", "Both!", "Neither — I prefer no pets"],
  },
  {
    title: "Do you prefer reading books or watching movies/shows?",
    description: "When you want to relax, which do you reach for first?",
    type: "poll",
    category: "Lifestyle",
    poll_options: ["Books 📚", "Movies / Shows 🎬", "Both equally", "Neither"],
  },

  // ── Product & Service Ratings ─────────────────────────────────────────────
  {
    title: "How would you rate Colgate toothpaste?",
    description: "Rate based on taste, whitening effectiveness, and overall satisfaction.",
    type: "rating",
    category: "Healthcare",
    poll_options: null,
  },
  {
    title: "Rate your KFC experience — food, service, and value",
    description: "Based on your most recent or typical visit to KFC.",
    type: "rating",
    category: "Food & Dining",
    poll_options: null,
  },
  {
    title: "How do you rate your McDonald's experience?",
    description: "Overall rating for food quality, speed, and value for money.",
    type: "rating",
    category: "Food & Dining",
    poll_options: null,
  },
  {
    title: "Rate your current mobile network provider",
    description: "Consider call quality, data speed, coverage, and customer support.",
    type: "rating",
    category: "Technology",
    poll_options: null,
  },
  {
    title: "How would you rate Netflix as a streaming platform?",
    description: "Content library, interface, pricing, and overall value.",
    type: "rating",
    category: "Entertainment",
    poll_options: null,
  },
  {
    title: "Rate Uber or your local ride-hailing service",
    description: "Consider driver quality, wait times, pricing, and app experience.",
    type: "rating",
    category: "Transportation",
    poll_options: null,
  },
  {
    title: "How satisfied are you with your home internet provider?",
    description: "Speed, reliability, customer support, and value for money.",
    type: "rating",
    category: "Technology",
    poll_options: null,
  },
  {
    title: "Rate Amazon's shopping experience",
    description: "Delivery speed, product selection, pricing, and ease of use.",
    type: "rating",
    category: "Shopping",
    poll_options: null,
  },
  {
    title: "How would you rate your most-used food delivery app?",
    description: "Think about Uber Eats, DoorDash, Grubhub, or a local equivalent.",
    type: "rating",
    category: "Food & Dining",
    poll_options: null,
  },
  {
    title: "Rate your local supermarket or grocery store",
    description: "Product variety, pricing, freshness, and customer experience.",
    type: "rating",
    category: "Shopping",
    poll_options: null,
  },
];

async function seed() {
  const client = await pool.connect();
  console.log("🌱 Seeding EarnQA starter questions...\n");

  let added = 0;
  let skipped = 0;

  for (const q of QUESTIONS) {
    // Skip if already exists (idempotent seed)
    const { rows: existing } = await client.query(
      "SELECT id FROM questions WHERE title = $1 LIMIT 1",
      [q.title]
    );

    if (existing.length > 0) {
      console.log(`  ⏭  Skipping: ${q.title}`);
      skipped++;
      continue;
    }

    const pollOptionsValue = q.poll_options
      ? `{${q.poll_options.map(o => `"${o.replace(/"/g, '\\"')}"`).join(",")}}`
      : null;

    await client.query(
      `INSERT INTO questions
        (title, description, type, category, status, is_custom, creator_id, creator_name, poll_options, total_answers, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, 'active', false, NULL, NULL, $5, 0, NOW(), NOW())`,
      [q.title, q.description, q.type, q.category, pollOptionsValue]
    );

    const typeLabel = q.type.padEnd(12);
    const catLabel = q.category.padEnd(14);
    console.log(`  ✅ [${typeLabel}] [${catLabel}] ${q.title}`);
    added++;
  }

  client.release();
  console.log(`\n✨ Done — ${added} added, ${skipped} skipped (already existed).`);

  // Final count
  const { rows } = await pool.query("SELECT COUNT(*) as total, type, status FROM questions GROUP BY type, status ORDER BY type");
  console.log("\n📊 Questions by type:");
  for (const row of rows) {
    console.log(`   ${row.status} | ${row.type.padEnd(12)} → ${row.total}`);
  }

  await pool.end();
}

seed().catch(err => {
  console.error("❌ Seed failed:", err.message);
  pool.end();
  process.exit(1);
});
