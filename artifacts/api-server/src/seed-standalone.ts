/**
 * Standalone production seed script.
 * Compiled to dist/seed.mjs by build.mjs and run BEFORE the server starts.
 * Idempotent: skips if questions already exist.
 */
import { db, questionsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { pool } from "@workspace/db";

const STARTER_QUESTIONS = [
  { title: "Which city or town do you currently live in?", description: "Tell us your city so we can surface location-based insights.", type: "short_answer", category: "Personal Profile", pollOptions: null as string[] | null },
  { title: "What is your current occupation or job title?", description: "Describe your role in a few words (e.g. Software Engineer, Teacher, Student).", type: "short_answer", category: "Personal Profile", pollOptions: null },
  { title: "What is your highest level of education?", description: "Select the highest academic level you have completed or are currently pursuing.", type: "poll", category: "Personal Profile", pollOptions: ["High School", "Some College", "Bachelor's Degree", "Master's Degree", "PhD / Doctorate", "Vocational / Trade", "Prefer not to say"] },
  { title: "What best describes your current employment status?", description: "Help us understand your working situation.", type: "poll", category: "Personal Profile", pollOptions: ["Employed full-time", "Employed part-time", "Self-employed / Freelance", "Student", "Unemployed", "Retired"] },
  { title: "What is your all-time favorite movie or TV show?", description: "Don't overthink it — just the one that comes to mind first.", type: "short_answer", category: "Entertainment", pollOptions: null },
  { title: "What's your favorite type of food or cuisine?", description: "Italian, Japanese, Mexican, local street food — anything goes!", type: "short_answer", category: "Food & Dining", pollOptions: null },
  { title: "Which app do you use the most every day?", description: "Think about the app you'd be lost without.", type: "short_answer", category: "Technology", pollOptions: null },
  { title: "Which smartphone brand do you prefer?", description: "If you had to pick just one brand for your next phone, which would it be?", type: "poll", category: "Technology", pollOptions: ["Apple (iPhone)", "Samsung", "Xiaomi", "Google Pixel", "Huawei", "OnePlus", "Other"] },
  { title: "What is your favorite sport to watch or play?", description: "Name the sport you're most passionate about.", type: "short_answer", category: "Sports", pollOptions: null },
  { title: "What's your go-to daily drink?", description: "The beverage you reach for most often throughout the day.", type: "poll", category: "Food & Dining", pollOptions: ["Coffee", "Tea", "Water", "Juice", "Soda / Fizzy drink", "Energy drink", "Milk"] },
  { title: "Tea or Coffee — which do you prefer?", description: "The eternal debate. Which side are you on?", type: "poll", category: "Lifestyle", pollOptions: ["Tea ☕", "Coffee ☕", "Both equally", "Neither"] },
  { title: "Do you prefer online shopping or in-store shopping?", description: "When you need to buy something, what's your default approach?", type: "poll", category: "Shopping & Brands", pollOptions: ["Always online", "Always in-store", "Depends on what I'm buying", "About 50/50"] },
  { title: "Work from home or office — which do you prefer?", description: "If you had complete freedom to choose, where would you rather work?", type: "poll", category: "Lifestyle", pollOptions: ["Full remote (home)", "Full office", "Hybrid (mix of both)", "I'm a student / not applicable"] },
  { title: "Are you a morning person or a night owl?", description: "When do you feel most productive and energized?", type: "poll", category: "Lifestyle", pollOptions: ["Morning person 🌅", "Night owl 🦉", "Somewhere in between", "Depends on the day"] },
  { title: "Android or iPhone — which team are you on?", description: "When it comes to smartphones, there are two camps. Which is yours?", type: "poll", category: "Technology", pollOptions: ["Android 🤖", "iPhone 🍎", "I switch between both", "Neither / Other"] },
  { title: "Pepsi or Coca-Cola — which do you choose?", description: "Given a free can at a restaurant, which would you reach for?", type: "poll", category: "Food & Dining", pollOptions: ["Pepsi", "Coca-Cola", "I'd drink either", "Neither — I don't drink soda"] },
  { title: "Which social media platform do you enjoy most?", description: "The one you'd keep if you could only use a single platform.", type: "poll", category: "Technology", pollOptions: ["Instagram", "TikTok", "YouTube", "X (Twitter)", "Facebook", "LinkedIn", "Snapchat", "Other"] },
  { title: "Cat person or dog person?", description: "If you had to pick just one as a pet, which would you choose?", type: "poll", category: "Lifestyle", pollOptions: ["Cat 🐱", "Dog 🐶", "Both!", "Neither — I prefer no pets"] },
  { title: "Do you prefer reading books or watching movies/shows?", description: "When you want to relax, which do you reach for first?", type: "poll", category: "Lifestyle", pollOptions: ["Books 📚", "Movies / Shows 🎬", "Both equally", "Neither"] },
  { title: "How would you rate Colgate toothpaste?", description: "Rate based on taste, whitening effectiveness, and overall satisfaction.", type: "rating", category: "Health & Wellness", pollOptions: null },
  { title: "Rate your KFC experience — food, service, and value", description: "Based on your most recent or typical visit to KFC.", type: "rating", category: "Food & Dining", pollOptions: null },
  { title: "How do you rate your McDonald's experience?", description: "Overall rating for food quality, speed, and value for money.", type: "rating", category: "Food & Dining", pollOptions: null },
  { title: "Rate your current mobile network provider", description: "Consider call quality, data speed, coverage, and customer support.", type: "rating", category: "Technology", pollOptions: null },
  { title: "How would you rate Netflix as a streaming platform?", description: "Content library, interface, pricing, and overall value.", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "Rate Uber or your local ride-hailing service", description: "Consider driver quality, wait times, pricing, and app experience.", type: "rating", category: "Transport & Travel", pollOptions: null },
  { title: "How satisfied are you with your home internet provider?", description: "Speed, reliability, customer support, and value for money.", type: "rating", category: "Technology", pollOptions: null },
  { title: "Rate Amazon's shopping experience", description: "Delivery speed, product selection, pricing, and ease of use.", type: "rating", category: "Shopping & Brands", pollOptions: null },
  { title: "How would you rate your most-used food delivery app?", description: "Think about Uber Eats, DoorDash, Grubhub, or a local equivalent.", type: "rating", category: "Food & Dining", pollOptions: null },
  { title: "Rate your local supermarket or grocery store", description: "Product variety, pricing, freshness, and customer experience.", type: "rating", category: "Shopping & Brands", pollOptions: null },
  { title: "How many hours of sleep do you get on a typical night?", description: "Be honest — what's your usual night's sleep?", type: "poll", category: "Health & Wellness", pollOptions: ["Less than 5 hours", "5–6 hours", "7–8 hours", "More than 8 hours"] },
  { title: "Do you exercise regularly?", description: "How often do you do intentional physical exercise?", type: "poll", category: "Health & Wellness", pollOptions: ["Daily", "3–5 times a week", "1–2 times a week", "Rarely", "Never"] },
  { title: "What is your primary mode of daily transportation?", description: "How do you usually get around on a typical day?", type: "poll", category: "Transport & Travel", pollOptions: ["Personal car", "Public transit (bus/metro)", "Walk / Bicycle", "Ride-hailing (Uber/Lyft)", "Motorbike/Scooter", "Work from home"] },
  { title: "How do you prefer to spend your weekends?", description: "What does a typical weekend look like for you?", type: "poll", category: "Lifestyle", pollOptions: ["Socializing with friends/family", "Relaxing at home", "Outdoor activities", "Catching up on work", "Exploring hobbies", "Mix of everything"] },
  { title: "What type of music do you listen to most?", description: "Pick the genre that best describes your everyday listening.", type: "poll", category: "Entertainment", pollOptions: ["Pop", "Hip-hop / R&B", "Rock / Alternative", "Electronic / Dance", "Classical / Jazz", "Afrobeats / World", "Country", "Other"] },
  { title: "What is one thing you wish you could improve about your daily routine?", description: "Any aspect — health, productivity, relationships, habits, etc.", type: "short_answer", category: "Lifestyle", pollOptions: null },
  { title: "Describe your ideal holiday destination in a few words", description: "Beach, mountains, city break, rural retreat — paint us a picture!", type: "short_answer", category: "Transport & Travel", pollOptions: null },
  { title: "What skill do you most wish you had learned earlier in life?", description: "Could be professional, creative, practical — anything goes.", type: "short_answer", category: "Lifestyle", pollOptions: null },
  { title: "How would you rate Spotify as a music streaming service?", description: "Music catalog, discovery features, app quality, and pricing.", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "Rate your experience with online banking / your bank's app", description: "Ease of use, features, reliability, and customer support.", type: "rating", category: "Finance & Economy", pollOptions: null },
  { title: "How would you rate your country's public healthcare system?", description: "Accessibility, quality of care, wait times, and affordability.", type: "rating", category: "Health & Wellness", pollOptions: null },
  { title: "Rate your most-used search engine (Google, Bing, etc.)", description: "Speed, accuracy, privacy, and overall quality of results.", type: "rating", category: "Technology", pollOptions: null },
  { title: "Gaming or outdoor activities — what's your preferred free-time hobby?", description: "When you have a few hours of free time, what's your default?", type: "poll", category: "Lifestyle", pollOptions: ["Gaming (video games)", "Outdoor activities", "Sports / fitness", "Reading / learning", "Creative hobbies (art, music, writing)", "Watching content (TV/movies)", "Socialising"] },
  { title: "How satisfied are you with your current work-life balance?", description: "Rate and reflect on how well you balance work demands with personal time.", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "Do you prefer cooking at home or eating out?", description: "On a typical week, which do you lean towards more?", type: "poll", category: "Food & Dining", pollOptions: ["Almost always cook at home", "Mostly cook, occasionally eat out", "About 50/50", "Mostly eat out", "Almost always eat out"] },
];

async function runSeed() {
  console.log("[seed] Checking questions table...");

  const [{ total }] = await db.select({ total: count() }).from(questionsTable);
  const existing = Number(total);

  if (existing > 0) {
    console.log(`[seed] ${existing} questions already exist — skipping seed.`);
    await pool.end();
    return;
  }

  console.log(`[seed] Table is empty — inserting ${STARTER_QUESTIONS.length} starter questions...`);

  const rows = STARTER_QUESTIONS.map(q => ({
    title: q.title,
    description: q.description,
    type: q.type,
    category: q.category,
    status: "active" as const,
    isCustom: false,
    creatorId: null as string | null,
    creatorName: null as string | null,
    pollOptions: q.pollOptions,
    totalAnswers: 0,
  }));

  await db.insert(questionsTable).values(rows);

  const [{ total: newTotal }] = await db.select({ total: count() }).from(questionsTable);
  console.log(`[seed] ✅ Done — ${newTotal} questions now in database.`);

  await pool.end();
}

runSeed().catch(err => {
  console.error("[seed] ❌ Seed failed:", err.message ?? err);
  process.exit(1);
});
