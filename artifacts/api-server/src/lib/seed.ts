import { db, questionsTable } from "@workspace/db";
import { count } from "drizzle-orm";
import { logger } from "./logger";

const STARTER_QUESTIONS = [
  // ── Core profile questions (isProfileQuestion: true, 2¢ reward) ───────────
  {
    title: "What is your full name?",
    description: "Enter your real full name. This is used for payment processing — please ensure the spelling is correct.",
    type: "short_answer",
    category: "Personal Profile",
    pollOptions: null as string[] | null,
    isProfileQuestion: true,
  },
  {
    title: "Which city or town do you live in?",
    description: "Tell us your city or town so we can surface location-based insights.",
    type: "short_answer",
    category: "Personal Profile",
    pollOptions: null as string[] | null,
    isProfileQuestion: true,
  },
  {
    title: "What is your gender?",
    description: "Select your gender.",
    type: "poll",
    category: "Personal Profile",
    pollOptions: ["Male", "Female", "Non-binary", "Prefer not to say"] as string[] | null,
    isProfileQuestion: true,
  },
  {
    title: "What is your age group?",
    description: "Select the age group that best describes you.",
    type: "poll",
    category: "Personal Profile",
    pollOptions: ["Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as string[] | null,
    isProfileQuestion: true,
  },
  {
    title: "Which country are you from?",
    description: "Tell us the country you are originally from or currently based in.",
    type: "short_answer",
    category: "Personal Profile",
    pollOptions: null as string[] | null,
    isProfileQuestion: true,
  },

  // ── Other profile category questions ──────────────────────────────────────
  {
    title: "Which city or town do you currently live in?",
    description: "Tell us your city so we can surface location-based insights.",
    type: "short_answer",
    category: "Personal Profile",
    pollOptions: null as string[] | null,
  },
  {
    title: "What is your current occupation or job title?",
    description: "Describe your role in a few words (e.g. Software Engineer, Teacher, Student).",
    type: "short_answer",
    category: "Personal Profile",
    pollOptions: null,
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

  // ── Preferences ──────────────────────────────────────────────────────────
  {
    title: "What is your all-time favorite movie or TV show?",
    description: "Don't overthink it — just the one that comes to mind first.",
    type: "short_answer",
    category: "Lifestyle",
    pollOptions: null,
  },
  {
    title: "What's your favorite type of food or cuisine?",
    description: "Italian, Japanese, Mexican, local street food — anything goes!",
    type: "short_answer",
    category: "Lifestyle",
    pollOptions: null,
  },
  {
    title: "Which app do you use the most every day?",
    description: "Think about the app you'd be lost without.",
    type: "short_answer",
    category: "Lifestyle",
    pollOptions: null,
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
    pollOptions: null,
  },
  {
    title: "What's your go-to daily drink?",
    description: "The beverage you reach for most often throughout the day.",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Coffee", "Tea", "Water", "Juice", "Soda / Fizzy drink", "Energy drink", "Milk"],
  },

  // ── Lifestyle Polls ───────────────────────────────────────────────────────
  {
    title: "Tea or Coffee — which do you prefer?",
    description: "The eternal debate. Which side are you on?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Tea ☕", "Coffee ☕", "Both equally", "Neither"],
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
    title: "Which social media platform do you enjoy most?",
    description: "The one you'd keep if you could only use a single platform.",
    type: "poll",
    category: "Technology",
    pollOptions: ["Instagram", "TikTok", "YouTube", "X (Twitter)", "Facebook", "LinkedIn", "Snapchat", "Other"],
  },
  {
    title: "Cat person or dog person?",
    description: "If you had to pick just one as a pet, which would you choose?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Cat 🐱", "Dog 🐶", "Both!", "Neither — I prefer no pets"],
  },
  {
    title: "Do you prefer reading books or watching movies/shows?",
    description: "When you want to relax, which do you reach for first?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Books 📚", "Movies / Shows 🎬", "Both equally", "Neither"],
  },

  // ── Product & Service Ratings ─────────────────────────────────────────────
  {
    title: "How would you rate Colgate toothpaste?",
    description: "Rate based on taste, whitening effectiveness, and overall satisfaction.",
    type: "rating",
    category: "Health & Wellness",
    pollOptions: null,
  },
  {
    title: "Rate your KFC experience — food, service, and value",
    description: "Based on your most recent or typical visit to KFC.",
    type: "rating",
    category: "Food & Dining",
    pollOptions: null,
  },
  {
    title: "How do you rate your McDonald's experience?",
    description: "Overall rating for food quality, speed, and value for money.",
    type: "rating",
    category: "Food & Dining",
    pollOptions: null,
  },
  {
    title: "Rate your current mobile network provider",
    description: "Consider call quality, data speed, coverage, and customer support.",
    type: "rating",
    category: "Technology",
    pollOptions: null,
  },
  {
    title: "How would you rate Netflix as a streaming platform?",
    description: "Content library, interface, pricing, and overall value.",
    type: "rating",
    category: "Entertainment",
    pollOptions: null,
  },
  {
    title: "Rate Uber or your local ride-hailing service",
    description: "Consider driver quality, wait times, pricing, and app experience.",
    type: "rating",
    category: "Transport & Travel",
    pollOptions: null,
  },
  {
    title: "How satisfied are you with your home internet provider?",
    description: "Speed, reliability, customer support, and value for money.",
    type: "rating",
    category: "Technology",
    pollOptions: null,
  },
  {
    title: "Rate Amazon's shopping experience",
    description: "Delivery speed, product selection, pricing, and ease of use.",
    type: "rating",
    category: "Shopping & Brands",
    pollOptions: null,
  },
  {
    title: "How would you rate your most-used food delivery app?",
    description: "Think about Uber Eats, DoorDash, Grubhub, or a local equivalent.",
    type: "rating",
    category: "Food & Dining",
    pollOptions: null,
  },
  {
    title: "Rate your local supermarket or grocery store",
    description: "Product variety, pricing, freshness, and customer experience.",
    type: "rating",
    category: "Shopping & Brands",
    pollOptions: null,
  },

  // ── Additional polls & short-answers ─────────────────────────────────────
  {
    title: "How many hours of sleep do you get on a typical night?",
    description: "Be honest — what's your usual night's sleep?",
    type: "poll",
    category: "Health & Wellness",
    pollOptions: ["Less than 5 hours", "5–6 hours", "7–8 hours", "More than 8 hours"],
  },
  {
    title: "Do you exercise regularly?",
    description: "How often do you do intentional physical exercise?",
    type: "poll",
    category: "Health & Wellness",
    pollOptions: ["Daily", "3–5 times a week", "1–2 times a week", "Rarely", "Never"],
  },
  {
    title: "What is your primary mode of daily transportation?",
    description: "How do you usually get around on a typical day?",
    type: "poll",
    category: "Transport & Travel",
    pollOptions: ["Personal car", "Public transit (bus/metro)", "Walk / Bicycle", "Ride-hailing (Uber/Lyft)", "Motorbike/Scooter", "Work from home"],
  },
  {
    title: "How do you prefer to spend your weekends?",
    description: "What does a typical weekend look like for you?",
    type: "poll",
    category: "Lifestyle",
    pollOptions: ["Socializing with friends/family", "Relaxing at home", "Outdoor activities", "Catching up on work", "Exploring hobbies", "Mix of everything"],
  },
  {
    title: "What type of music do you listen to most?",
    description: "Pick the genre that best describes your everyday listening.",
    type: "poll",
    category: "Entertainment",
    pollOptions: ["Pop", "Hip-hop / R&B", "Rock / Alternative", "Electronic / Dance", "Classical / Jazz", "Afrobeats / World", "Country", "Other"],
  },
  {
    title: "What is one thing you wish you could improve about your daily routine?",
    description: "Any aspect — health, productivity, relationships, habits, etc.",
    type: "short_answer",
    category: "Lifestyle",
    pollOptions: null,
  },
  {
    title: "Describe your ideal holiday destination in a few words",
    description: "Beach, mountains, city break, rural retreat — paint us a picture!",
    type: "short_answer",
    category: "Lifestyle",
    pollOptions: null,
  },
  {
    title: "What skill do you most wish you had learned earlier in life?",
    description: "Could be professional, creative, practical — anything goes.",
    type: "short_answer",
    category: "Lifestyle",
    pollOptions: null,
  },
  {
    title: "How would you rate Spotify as a music streaming service?",
    description: "Music catalog, discovery features, app quality, and pricing.",
    type: "rating",
    category: "Entertainment",
    pollOptions: null,
  },
  {
    title: "Rate your experience with online banking / your bank's app",
    description: "Ease of use, features, reliability, and customer support.",
    type: "rating",
    category: "Finance & Economy",
    pollOptions: null,
  },
  {
    title: "How would you rate your country's public healthcare system?",
    description: "Accessibility, quality of care, wait times, and affordability.",
    type: "rating",
    category: "Health & Wellness",
    pollOptions: null,
  },
  {
    title: "Rate your most-used search engine (Google, Bing, etc.)",
    description: "Speed, accuracy, privacy, and overall quality of results.",
    type: "rating",
    category: "Technology",
    pollOptions: null,
  },

  // ── 100 new questions ─────────────────────────────────────────────────────

  // Personal
  { title: "What's your favorite season?", type: "poll", category: "Lifestyle", pollOptions: ["Spring","Summer","Autumn","Winter"] },
  { title: "Coffee or tea — which do you prefer?", type: "poll", category: "Lifestyle", pollOptions: ["Coffee","Tea","Neither","Both equally"] },
  { title: "What type of music do you enjoy most?", type: "poll", category: "Lifestyle", pollOptions: ["Pop","Rock","Hip-Hop","Classical","Electronic"] },
  { title: "Watching movies at home or at the cinema?", type: "poll", category: "Lifestyle", pollOptions: ["At home","Cinema","Equally love both"] },
  { title: "Sweet or savory — which side are you on?", type: "poll", category: "Lifestyle", pollOptions: ["Sweet","Savory","Both equally"] },
  { title: "Books or TV shows — how do you prefer stories?", type: "poll", category: "Lifestyle", pollOptions: ["Books","TV shows","Both equally","Neither"] },
  { title: "How do you prefer to spend your weekends?", type: "poll", category: "Lifestyle", pollOptions: ["Relaxing at home","Going out","Mix of both"] },
  { title: "What's your dream vacation type?", type: "poll", category: "Lifestyle", pollOptions: ["Beach","Mountains","City break","Countryside"] },
  { title: "Morning person or night owl?", type: "poll", category: "Lifestyle", pollOptions: ["Morning person","Night owl","Somewhere in between"] },
  { title: "Favorite movie genre?", type: "poll", category: "Lifestyle", pollOptions: ["Action","Comedy","Drama","Sci-Fi","Horror","Romance"] },
  { title: "How do you prefer to socialize?", type: "poll", category: "Lifestyle", pollOptions: ["Large groups","Small groups","One-on-one","I mostly keep to myself"] },
  { title: "Cook at home or eat out?", type: "poll", category: "Lifestyle", pollOptions: ["Cook at home","Eat out","Mix of both"] },
  { title: "Rate your love for traveling", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "Dog person or cat person?", type: "poll", category: "Lifestyle", pollOptions: ["Dog","Cat","Both equally","Neither"] },
  { title: "Mountains or beaches?", type: "poll", category: "Lifestyle", pollOptions: ["Mountains","Beaches","Both equally"] },
  { title: "How do you prefer to receive news?", type: "poll", category: "Lifestyle", pollOptions: ["Social media","News apps","TV","Newspapers/Podcasts"] },
  { title: "What's your most productive time of day?", type: "poll", category: "Lifestyle", pollOptions: ["Early morning","Late morning","Afternoon","Evening","Late night"] },
  { title: "Do you prefer bold flavors or mild ones?", type: "poll", category: "Lifestyle", pollOptions: ["Bold and spicy","Mild and subtle","Depends on my mood"] },
  { title: "Rate how much you enjoy cooking", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "What's your ideal weekend plan?", type: "poll", category: "Lifestyle", pollOptions: ["Sleep in and relax","Explore somewhere new","Spend time with friends","Work on a personal project"] },

  // Lifestyle
  { title: "How many hours of sleep do you usually get?", type: "poll", category: "Lifestyle", pollOptions: ["Less than 6 hours","6–7 hours","7–8 hours","8–9 hours","9+ hours"] },
  { title: "How often do you exercise?", type: "poll", category: "Lifestyle", pollOptions: ["Daily","A few times a week","Occasionally","Rarely or never"] },
  { title: "How do you start your mornings?", type: "poll", category: "Lifestyle", pollOptions: ["Check my phone","Work out","Meditate or journal","Eat breakfast first","Just get up and go"] },
  { title: "Do you work better from home or the office?", type: "poll", category: "Lifestyle", pollOptions: ["Home","Office","A café or co-working space","I mix it up"] },
  { title: "How often do you meal prep for the week?", type: "poll", category: "Lifestyle", pollOptions: ["Every week","Sometimes","Rarely","Never"] },
  { title: "Are you more of an introvert or extrovert?", type: "poll", category: "Lifestyle", pollOptions: ["Introvert","Extrovert","Ambivert — depends on the day"] },
  { title: "How important is a daily routine to you?", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "How often do you take breaks during work?", type: "poll", category: "Lifestyle", pollOptions: ["Every 30 minutes","Every hour","Every couple of hours","Rarely"] },
  { title: "Do you prefer a tidy or lived-in home?", type: "poll", category: "Lifestyle", pollOptions: ["Very tidy — everything in its place","Organized chaos","Comfortably lived-in"] },
  { title: "How do you usually handle stress?", type: "poll", category: "Lifestyle", pollOptions: ["Exercise","Talk to someone","Distract myself","Rest and sleep","Push through it"] },
  { title: "Shopping online or in-store?", type: "poll", category: "Lifestyle", pollOptions: ["Online always","In-store always","Both — depends on what it is"] },
  { title: "How much water do you drink daily?", type: "poll", category: "Lifestyle", pollOptions: ["Less than 1 litre","1–2 litres","2–3 litres","3+ litres"] },
  { title: "Rate your overall health and wellbeing right now", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "Do you prefer silence or background noise while working?", type: "poll", category: "Lifestyle", pollOptions: ["Total silence","Music","White noise or rain sounds","TV or podcast in background"] },
  { title: "How do you unwind at the end of the day?", type: "poll", category: "Lifestyle", pollOptions: ["Watch something","Read","Gaming","Socialise","Exercise","Just sleep"] },
  { title: "Rate how satisfied you are with your work-life balance", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "Do you follow a morning skincare routine?", type: "poll", category: "Lifestyle", pollOptions: ["Yes, always","Sometimes","No, I keep it simple"] },
  { title: "How many vacations do you take per year?", type: "poll", category: "Lifestyle", pollOptions: ["None","1–2","3–5","More than 5"] },
  { title: "How important is having clear goals in life to you?", type: "rating", category: "Lifestyle", pollOptions: null },
  { title: "Do you prefer spontaneous plans or scheduling ahead?", type: "poll", category: "Lifestyle", pollOptions: ["Plan everything in advance","Mostly plan but stay flexible","Mostly spontaneous","Total spontaneity always"] },

  // Technology
  { title: "What's your primary smartphone brand?", type: "poll", category: "Technology", pollOptions: ["Apple (iPhone)","Samsung","Google (Pixel)","OnePlus","Other"] },
  { title: "Do you use AI tools in your daily life?", type: "poll", category: "Technology", pollOptions: ["Yes, regularly","Sometimes","Rarely","No, not yet"] },
  { title: "How many hours a day do you spend on your phone?", type: "poll", category: "Technology", pollOptions: ["Less than 2 hours","2–4 hours","4–6 hours","More than 6 hours"] },
  { title: "Do you think AI will mostly help or harm humanity?", type: "poll", category: "Technology", pollOptions: ["Mostly help","Mostly harm","Both equally","Too early to tell"] },
  { title: "Your most-used social media platform?", type: "poll", category: "Technology", pollOptions: ["Instagram","TikTok","Twitter/X","YouTube","LinkedIn","Facebook"] },
  { title: "Dark mode or light mode?", type: "poll", category: "Technology", pollOptions: ["Dark mode always","Light mode always","Depends on the time of day"] },
  { title: "How important is fast internet to your daily life?", type: "rating", category: "Technology", pollOptions: null },
  { title: "Do you own a smart home device?", type: "poll", category: "Technology", pollOptions: ["Yes, and I love it","Yes, but I barely use it","No, but I want one","No, not interested"] },
  { title: "What do you mainly use your laptop or PC for?", type: "poll", category: "Technology", pollOptions: ["Work","Gaming","Creative projects","Browsing and streaming","All of the above"] },
  { title: "How often do you update your apps?", type: "poll", category: "Technology", pollOptions: ["As soon as updates drop","Occasionally","Only when forced","Rarely"] },
  { title: "Do you back up your data regularly?", type: "poll", category: "Technology", pollOptions: ["Yes, always","Sometimes","No, I should probably start"] },
  { title: "Rate your overall tech-savviness", type: "rating", category: "Technology", pollOptions: null },
  { title: "Apps or websites — which do you prefer for services?", type: "poll", category: "Technology", pollOptions: ["Apps all the way","Websites — no clutter","No preference"] },
  { title: "How concerned are you about your online privacy?", type: "rating", category: "Technology", pollOptions: null },
  { title: "Does social media have more positive or negative impact?", type: "poll", category: "Technology", pollOptions: ["Mostly positive","Mostly negative","Both — depends on how you use it"] },
  { title: "What type of content do you consume most online?", type: "poll", category: "Technology", pollOptions: ["Short videos (Reels/TikTok)","Long-form YouTube","Articles and blogs","Podcasts","All of these"] },
  { title: "E-books or physical books?", type: "poll", category: "Technology", pollOptions: ["E-books","Physical books","Both equally","I don't really read books"] },
  { title: "How often do you video call with friends or family?", type: "poll", category: "Technology", pollOptions: ["Daily","A few times a week","Monthly","Rarely"] },
  { title: "Do you use a VPN?", type: "poll", category: "Technology", pollOptions: ["Yes, always","Sometimes","No"] },
  { title: "Rate the overall impact of technology on your quality of life", type: "rating", category: "Technology", pollOptions: null },

  // Social
  { title: "Is remote work more productive than office work?", type: "poll", category: "Social & Society", pollOptions: ["Yes, definitely","No, the office is better","It depends on the person","Not sure"] },
  { title: "How important is having a large social circle to you?", type: "rating", category: "Social & Society", pollOptions: null },
  { title: "Are social media influencers good role models?", type: "poll", category: "Social & Society", pollOptions: ["Yes","No","Some of them are","It completely depends"] },
  { title: "How comfortable are you speaking in front of a crowd?", type: "rating", category: "Social & Society", pollOptions: null },
  { title: "Kindness or honesty — which matters more?", type: "poll", category: "Social & Society", pollOptions: ["Kindness","Honesty","Both equally","It really depends"] },
  { title: "Do you believe in giving people second chances?", type: "poll", category: "Social & Society", pollOptions: ["Yes, always","Usually yes","Only once","Rarely"] },
  { title: "Can money buy happiness?", type: "poll", category: "Social & Society", pollOptions: ["Yes, to a degree","No, never","It solves most problems","It's complicated"] },
  { title: "How important is sustainability in your daily choices?", type: "rating", category: "Social & Society", pollOptions: null },
  { title: "Do you prefer to lead or follow in a team?", type: "poll", category: "Social & Society", pollOptions: ["I prefer to lead","I prefer to follow","It depends on the situation"] },
  { title: "Is success mostly about hard work or luck?", type: "poll", category: "Social & Society", pollOptions: ["Mostly hard work","Mostly luck","Both equally","Something else entirely"] },
  { title: "Rate how open-minded you consider yourself", type: "rating", category: "Social & Society", pollOptions: null },
  { title: "Do you think failure is an important part of success?", type: "poll", category: "Social & Society", pollOptions: ["Yes, absolutely","Not necessarily","It can be, it depends"] },
  { title: "How important is recognition from others to your motivation?", type: "rating", category: "Social & Society", pollOptions: null },
  { title: "Do you prefer direct or gentle feedback?", type: "poll", category: "Social & Society", pollOptions: ["Direct — just tell me","Gentle — soften it a bit","Depends on the situation"] },
  { title: "Do you think most people are fundamentally good?", type: "poll", category: "Social & Society", pollOptions: ["Yes, I do","No, I don't","It depends on circumstances","Unsure"] },
  { title: "Rate your confidence in social situations", type: "rating", category: "Social & Society", pollOptions: null },
  { title: "Is it important to follow traditions?", type: "poll", category: "Social & Society", pollOptions: ["Yes, always","Some traditions yes","Not particularly","No, traditions hold us back"] },
  { title: "How often do you volunteer or give back to your community?", type: "poll", category: "Social & Society", pollOptions: ["Regularly","Occasionally","Rarely","Never"] },
  { title: "Is it more important to be liked or respected?", type: "poll", category: "Social & Society", pollOptions: ["Liked","Respected","Both equally","Neither matters to me"] },
  { title: "Rate how much you enjoy meeting new people", type: "rating", category: "Social & Society", pollOptions: null },

  // Fun
  { title: "Superpower: fly or be invisible?", type: "poll", category: "Entertainment", pollOptions: ["Fly","Be invisible"] },
  { title: "What's your go-to karaoke genre?", type: "poll", category: "Entertainment", pollOptions: ["Pop hits","Rock classics","R&B / Soul","I don't do karaoke"] },
  { title: "Do you believe in luck?", type: "poll", category: "Entertainment", pollOptions: ["Yes, definitely","Somewhat","No, not really"] },
  { title: "Rate how adventurous you are with trying new food", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "Too hot or too cold — which is worse?", type: "poll", category: "Entertainment", pollOptions: ["Too hot","Too cold"] },
  { title: "What's the first thing you'd do with $1 million?", type: "poll", category: "Entertainment", pollOptions: ["Travel the world","Invest it","Buy a house","Give to charity","Pay off debts"] },
  { title: "Do you believe there's life on other planets?", type: "poll", category: "Entertainment", pollOptions: ["Yes, definitely","Probably","Probably not","Definitely not"] },
  { title: "Famous or extremely wealthy — which would you choose?", type: "poll", category: "Entertainment", pollOptions: ["Famous","Extremely wealthy","Neither","Both, please"] },
  { title: "Rate how much you enjoy unexpected surprises", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "Time travel: the past or the future?", type: "poll", category: "Entertainment", pollOptions: ["The past","The future","Neither — I like the present"] },
  { title: "Rate how competitive you are in general", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "Texting or calling — which do you prefer?", type: "poll", category: "Entertainment", pollOptions: ["Texting always","Calling always","Video calls","Depends on who it is"] },
  { title: "If you could master one skill instantly, what would it be?", type: "poll", category: "Entertainment", pollOptions: ["A new language","A musical instrument","Cooking like a chef","Coding","A sport"] },
  { title: "More money or more free time?", type: "poll", category: "Entertainment", pollOptions: ["More money","More free time","An equal balance of both"] },
  { title: "Rate how happy you are with your life right now", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "Would you rather live in a city or the countryside?", type: "poll", category: "Entertainment", pollOptions: ["City","Countryside","Suburbs","Doesn't matter as long as I'm happy"] },
  { title: "Do you believe dreams have hidden meanings?", type: "poll", category: "Entertainment", pollOptions: ["Yes, always","Sometimes","No, they're just random","I rarely dream"] },
  { title: "Solve it yourself or ask for help straight away?", type: "poll", category: "Entertainment", pollOptions: ["Try to solve it myself first","Ask for help straight away","Depends on how urgent it is"] },
  { title: "Rate how much of a risk-taker you are", type: "rating", category: "Entertainment", pollOptions: null },
  { title: "If you could live anywhere in the world, where would you go?", type: "poll", category: "Entertainment", pollOptions: ["Europe","Southeast Asia","North America","Australia / NZ","Stay where I am"] },
];

export async function seedStarterQuestions(): Promise<void> {
  try {
    // Idempotent per-title check — safe to run on every startup
    const existing = await db.select({ title: questionsTable.title }).from(questionsTable);
    const existingTitles = new Set(existing.map(q => q.title.toLowerCase().trim()));

    const toInsert = STARTER_QUESTIONS.filter(
      q => !existingTitles.has(q.title.toLowerCase().trim())
    );

    if (toInsert.length === 0) {
      logger.info({ total: existing.length }, "Seed: all starter questions already present");
      return;
    }

    logger.info({ count: toInsert.length }, "Seed: inserting missing starter questions...");

    const rows = toInsert.map(q => ({
      title: q.title,
      description: (q as any).description ?? null,
      type: q.type,
      category: q.category,
      status: "active" as const,
      isCustom: false,
      isProfileQuestion: (q as any).isProfileQuestion ?? false,
      creatorId: null as string | null,
      creatorName: null as string | null,
      pollOptions: q.pollOptions,
      totalAnswers: 0,
    }));

    await db.insert(questionsTable).values(rows);
    logger.info({ count: rows.length }, "Seed: starter questions inserted successfully");
  } catch (err) {
    logger.error({ err }, "Failed to seed starter questions — continuing anyway");
  }
}
