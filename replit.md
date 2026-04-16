# EarnQA — Reward-Based Q&A Platform

## Project Overview
A full-stack Q&A platform where users earn real money (in cents) for sharing their opinions. Built with React + Vite frontend, Express API server, PostgreSQL database, and Clerk authentication.

## Architecture

### Artifacts
- **EarnQA** (`artifacts/earnqa`) — React + Vite web app, preview path `/`
- **API Server** (`artifacts/api-server`) — Express.js REST API, port 8080

### Shared Packages
- `lib/db` — Drizzle ORM schema + database client
- `lib/api-spec` — OpenAPI spec (`openapi.yaml`)
- `lib/api-client-react` — React Query hooks generated via Orval

## Earning Logic
- Users earn **1¢** per answer submitted (2¢ for profile questions)
- Question creators earn **0.5¢** creator bonus per answer on their custom questions
- Creating a custom question costs **100¢** ($1.00) — requires admin approval before going live
- Withdrawal requests deduct from balance immediately; `totalWithdrawnCents` only updates when admin approves
- Rejected questions refund 100¢ to the creator's wallet
- Rejected withdrawal requests refund the amount back to the user's balance

## Referral / Invite & Earn System
- Users get a unique **referral code** (auto-generated on first login; existing users backfilled)
- Share link: `https://opinoza.com/?ref=CODE`
- **Referrer earns 10¢** when a friend signs up via their link (signup bonus)
- **Referrer earns 0.5¢** for each answer their referred friend submits (answer bonus)
- Fraud detection: flags referrals with same IP as referrer click, or IP velocity >3 in 24h
- Referral flow: `?ref=CODE` → localStorage → POST /api/referrals/claim after new user's first login
- Admin can approve / flag / reverse referrals (reclaims bonuses from referrer wallet)
- Transaction types: `referral_signup_bonus`, `referral_answer_bonus`, `referral_reversal`

## Share + Bonus Milestone System
- **Share buttons** shown on every question page (all users): WhatsApp, Facebook, Twitter/X, Copy Link
  - Pre-filled share message: "I found this interesting question 👇 Give your opinion! [url]"
  - Non-creator sees "Share this question"; creator sees "Share your question to get more answers and earn bonuses"
- **Milestone bonuses** paid to question creator based on UNIQUE non-creator answerer count:
  - 10 unique answers → **10¢ bonus**
  - 50 unique answers → **$1 (100¢) bonus**
  - Every additional 50 (100, 150, 200, ...) → **$1 bonus each**
- Milestones tracked in `question_milestones` table with unique constraint (questionId, milestone) to prevent double-rewarding
- **Bonus Progress Box** shown only to the question creator: animated progress bar, current/next milestone, cents needed
- Bonus progress box auto-refreshes when the creator submits an answer on any question

## Database Schema (`lib/db/src/schema/index.ts`)
- `users` — Clerk user ID, email, name, city, ageGroup, gender, isAdmin, referralCode (unique), referredByUserId, signupIp, userAgent
- `questions` — title, description, type (short_answer/poll/rating), category, status, pollOptions[], isCustom, isProfileQuestion, totalAnswers, creatorId, creatorName
- `answers` — questionId, userId, answerText, pollOption, rating, reason
- `wallets` — userId, balanceCents, totalEarnedCents, totalWithdrawnCents
- `transactions` — userId, type (earning/withdrawal/question_creation/creator_bonus/profile_reward/referral_signup_bonus/referral_answer_bonus/referral_reversal), amountCents, description, status, relatedId
- `question_milestones` — questionId, milestone (10/50/100/150...), rewardCents; unique(questionId, milestone) prevents duplicates
- `referrals` — referrerUserId, referredUserId (unique), referralCodeUsed, signupBonusCents, answerBonusCentsTotal, status (approved/flagged/rejected/pending), fraudFlags (JSONB)
- `referral_clicks` — referralCode, referrerUserId, ipAddress, userAgent, sessionId (analytics)

## API Routes (`artifacts/api-server/src/routes/`)
- `questions.ts` — GET list (filter by category/type/status), GET featured, GET categories, GET :id (with results), POST create (costs 100¢)
- `answers.ts` — POST submit answer (type-validated, duplicate-blocked), GET /my; fires referral answer bonus
- `users.ts` — GET /me (returns isNew + referralCode), PATCH /me, GET /me/stats, GET /me/questions; auto-generates referralCode for new/existing users
- `wallet.ts` — GET balance, GET /transactions, POST /withdraw (deducts balance immediately)
- `admin.ts` — GET/approve/reject/PATCH/DELETE questions, GET users, GET/approve/reject withdrawals, GET stats, PATCH toggle-admin
- `analytics.ts` — by-category, by-gender, by-age, by-city (all with optional questionId filter), platform-summary
- `referrals.ts` — GET /me (code, link, stats, list), POST /click (analytics), POST /claim (process referral); admin: GET stats, GET list, PATCH status, POST reverse
- `health.ts` — Health check

## Frontend Pages (`artifacts/earnqa/src/pages/`)
- `home.tsx` — Landing page with hero, stats, featured questions, categories, how-it-works
- `questions.tsx` — Browse with live search + category + type filters, skeleton loading, error states
- `question-detail.tsx` — Answer forms (short_answer/poll/rating), poll results, star rating display, celebration animation, already-answered state
- `dashboard.tsx` — User stats, wallet balance, quick actions, recent activity
- `wallet.tsx` — Balance card, withdrawal form, transaction history
- `ask.tsx` — Custom question form (costs 100¢) + "My Questions" tracker showing submitted question status (pending/active/rejected)
- `insights.tsx` — Filter controls (category/gender/age) + Recharts bar/pie charts with skeleton loading
- `profile.tsx` — Update name, city, age group, gender
- `invite.tsx` — Invite & Earn page: referral link/code, copy/share buttons, stats (total invites, earned, pending), referral history list
- `admin.tsx` — Tabs: pending review / all questions / withdrawals / users / stats / referrals. Edit modal for questions, approve/reject withdrawals, approve/flag/reverse referrals

## Custom Hooks (`artifacts/earnqa/src/hooks/`)
- `useMyQuestions.ts` — Fetches `/api/users/me/questions` with Clerk auth token

## Design System
- **Theme**: Premium Gold (#F59E0B amber) + Deep Navy (#1e2a4a) — NOT green
- **CSS Variables**: `gold-gradient`, navy sidebar, warm cream background  
- **Animations**: Framer Motion for page transitions, earning celebrations
- **Charts**: Recharts (bar, pie) for analytics with color array COLORS[]

## Authentication
- Clerk (Auth) with proxy URL  
- `VITE_CLERK_PUBLISHABLE_KEY` in earnqa `.env`
- `CLERK_SECRET_KEY` in api-server `.env`
- Clerk middleware in `app.ts`, `getAuth()` in routes

## Admin Access
Set `isAdmin = true` in the `users` table for a user's clerkId to grant admin access.

## Key Commands
```bash
# Push DB schema changes
pnpm --filter @workspace/db run push

# Regenerate API client hooks
pnpm --filter @workspace/api-spec run codegen

# Build API server
pnpm --filter @workspace/api-server run build
```

## Seeded Data
15 demo questions across 7 categories: Technology, Food & Dining, Health & Fitness, Transportation, Healthcare, Entertainment, Shopping, Education
