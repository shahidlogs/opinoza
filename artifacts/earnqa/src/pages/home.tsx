import { useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, useInView } from "framer-motion";
import { useUser } from "@clerk/react";
import { useGetFeaturedQuestions, useGetPlatformSummary, useGetCategories, CATEGORY_ICONS, HOME_DISPLAY_CATEGORIES } from "@workspace/api-client-react";
import { usePageMeta } from "@/lib/page-meta";

const TYPE_COLORS: Record<string, string> = {
  short_answer: "bg-slate-100 text-slate-700 border-slate-200",
  poll: "bg-blue-50 text-blue-700 border-blue-100",
  rating: "bg-amber-50 text-amber-700 border-amber-200",
};
const TYPE_LABELS: Record<string, string> = {
  short_answer: "✍️ Short Answer",
  poll: "📊 Poll",
  rating: "⭐ Rating",
};

const FLOATERS = Array.from({ length: 12 }, (_, i) => ({
  x: 8 + (i * 8) % 92, y: 10 + (i * 13) % 80, delay: (i * 0.37) % 3, dur: 2.5 + (i * 0.4) % 2,
}));

function StarIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  );
}

function FeaturedCard({ q, index }: { q: any; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
    >
      <Link href={`/questions/${q.id}`}>
        <div className="group bg-card border border-card-border rounded-2xl p-5 sm:p-6 cursor-pointer card-hover h-full flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-4">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TYPE_COLORS[q.type] || "bg-gray-50 text-gray-700 border-gray-100"}`}>
              {TYPE_LABELS[q.type] || q.type}
            </span>
            <div className="flex flex-wrap gap-1 justify-end">
              {((q as any).categories ?? [q.category]).map((cat: string) => (
                <span key={cat} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">{cat}</span>
              ))}
            </div>
          </div>

          <h3 className="font-semibold text-foreground leading-snug mb-3 flex-1 group-hover:text-amber-700 transition-colors text-[0.95rem] line-clamp-2">
            {q.title}
          </h3>

          <div className="flex items-center justify-between text-xs pt-3 border-t border-border/60">
            <span className="text-muted-foreground">{q.totalAnswers} answer{q.totalAnswers !== 1 ? "s" : ""}</span>
            <span className="earn-badge">
              <StarIcon size={10} />
              Earn 1¢
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5 }}>
      {children}
    </motion.div>
  );
}

export default function Home() {
  usePageMeta(
    "Opinoza – Answer Questions & Earn Money",
    "Share your opinions and earn real money on Opinoza. Answer polls, ratings, and questions to earn 1¢ per answer. Join thousands of users today.",
    "https://opinoza.com",
  );

  const { isSignedIn } = useUser();
  const [, navigate] = useLocation();

  const { data: featuredData, isLoading: featuredLoading, isError: featuredError } = useGetFeaturedQuestions();
  const { data: summary } = useGetPlatformSummary();
  const { data: categoriesData } = useGetCategories();

  const featured = featuredData?.questions?.slice(0, 6) ?? [];
  const categories = (categoriesData?.categories ?? [])
    .filter(c => HOME_DISPLAY_CATEGORIES.includes(c.category as any))
    .sort((a, b) => HOME_DISPLAY_CATEGORIES.indexOf(a.category as any) - HOME_DISPLAY_CATEGORIES.indexOf(b.category as any));
  const featuredLoaded = !featuredLoading && !featuredError;

  return (
    <div className="overflow-x-hidden">
      {/* ── Hero ── */}
      <section className="relative navy-gradient-deep py-24 sm:py-32 px-4 text-white overflow-hidden">
        {/* Floating stars */}
        {FLOATERS.map((f, i) => (
          <motion.div
            key={i}
            className="absolute text-amber-400/30 pointer-events-none"
            style={{ left: `${f.x}%`, top: `${f.y}%` }}
            animate={{ y: [0, -16, 0], opacity: [0.25, 0.7, 0.25], scale: [1, 1.1, 1] }}
            transition={{ duration: f.dur, repeat: Infinity, delay: f.delay, ease: "easeInOut" }}
          >
            <StarIcon size={i % 3 === 0 ? 14 : i % 3 === 1 ? 10 : 18} />
          </motion.div>
        ))}

        {/* Orb decorations */}
        <div className="absolute top-16 right-8 sm:right-24 w-72 h-72 rounded-full bg-amber-400/8 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-96 h-48 bg-blue-500/8 blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-sm font-semibold mb-6 shadow-inner">
              <StarIcon size={12} className="text-amber-400" />
              Earn real money — 1¢ per answer
            </div>

            {/* ── System alert banner ── */}
            <div className="w-full max-w-2xl mx-auto mb-7 rounded-xl px-5 py-4 text-white text-sm sm:text-base leading-relaxed" style={{ backgroundColor: "#e02424" }}>
              <p className="font-bold mb-1">⚠️ System Alert</p>
              <p className="font-normal opacity-95">
                Multiple accounts from the same device are not allowed. Rewards for such accounts have been blocked. ID verification is now required for withdrawals.
              </p>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.08] mb-6 tracking-tight">
              Your Opinions Are{" "}
              <span className="relative">
                <span className="gold-shimmer">Worth Gold</span>
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-blue-100/90 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
              Share honest answers on polls, ratings, and questions — every insight you give puts real money in your wallet.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <motion.button
                onClick={() => navigate(isSignedIn ? "/invite" : "/sign-up")}
                whileHover={{ scale: 1.04, boxShadow: "0 8px 24px rgba(245,158,11,0.4)" }}
                whileTap={{ scale: 0.97 }}
                className="w-full sm:w-auto px-8 py-4 rounded-xl font-bold text-lg gold-gradient text-white shadow-lg transition-all"
              >
                Start Earning Free →
              </motion.button>
              <Link href="/questions">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all"
                >
                  Browse Questions
                </motion.button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="bg-white border-b border-border py-6 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-border">
          {[
            { label: "Active Questions", value: summary?.totalActiveQuestions ?? "15+", icon: "❓" },
            { label: "Earned Per Answer", value: "1¢", icon: "⚡" },
            { label: "Answered This Week", value: summary?.totalAnswersThisWeek ?? "0", icon: "📈" },
            { label: "Creator Bonus", value: "0.5¢", icon: "🌟" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="text-center px-6 py-4"
            >
              <div className="text-2xl font-extrabold text-amber-600 tabular-nums">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Featured Questions ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <SectionHeader>
          <div className="flex items-end justify-between mb-8 gap-4">
            <div>
              <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Featured</div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">Featured Questions</h2>
              <p className="text-muted-foreground mt-1.5">Answer any of these to earn 1 cent, instantly</p>
            </div>
            <Link href="/questions">
              <motion.button
                whileHover={{ x: 3 }}
                className="text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                View all
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </motion.button>
            </Link>
          </div>
        </SectionHeader>

        {featuredLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-card border border-card-border rounded-2xl p-6 animate-pulse h-36">
                <div className="flex gap-2 mb-4"><div className="h-5 bg-muted rounded-full w-24"/><div className="h-5 bg-muted rounded-full w-20"/></div>
                <div className="h-4 bg-muted rounded w-4/5 mb-2"/><div className="h-4 bg-muted rounded w-3/5"/>
              </div>
            ))}
          </div>
        ) : featuredError ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="font-medium text-foreground">Couldn't load questions</p>
            <p className="text-sm mt-1">Please refresh the page to try again.</p>
          </div>
        ) : featuredLoaded && featured.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-4">⭐</p>
            <p className="font-semibold text-foreground text-lg mb-1">Questions coming soon</p>
            <p className="text-sm">Check back shortly — new questions are being added.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {featured.map((q, i) => <FeaturedCard key={q.id} q={q} index={i} />)}
          </div>
        )}
      </section>

      {/* ── Categories ── */}
      {categories.length > 0 && (
        <section className="bg-muted/40 border-y border-border py-16 px-4">
          <div className="max-w-7xl mx-auto">
            <SectionHeader>
              <div className="text-center mb-10">
                <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Explore</div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">Browse by Category</h2>
              </div>
            </SectionHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {categories.map((cat, i) => (
                <motion.div
                  key={cat.category}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link href={`/questions?category=${encodeURIComponent(cat.category)}`}>
                    <div className="bg-card border border-card-border rounded-xl p-4 cursor-pointer card-hover text-center group">
                      <div className="text-2xl mb-2">{CATEGORY_ICONS[cat.category] || "💡"}</div>
                      <div className="font-semibold text-xs text-foreground group-hover:text-amber-700 transition-colors leading-tight">{cat.category}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{cat.count}q</div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How It Works ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <SectionHeader>
          <div className="text-center mb-14">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Simple</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">How Opinoza Works</h2>
          </div>
        </SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          {[
            {
              step: "01",
              title: "Sign Up Free",
              desc: "Create your account in seconds. No credit card required — start earning immediately.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
            },
            {
              step: "02",
              title: "Answer Questions",
              desc: "Share your honest opinions on polls, star ratings, and short answers. Takes seconds each.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,
            },
            {
              step: "03",
              title: "Earn & Withdraw",
              desc: "Get 1¢ credited per answer. Build your balance and request a withdrawal anytime.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
            },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className="relative text-center group"
            >
              {i < 2 && (
                <div className="hidden md:block absolute top-7 left-[60%] w-[calc(100%-60%+32px)] h-px bg-gradient-to-r from-amber-200 to-transparent" />
              )}
              <div className="w-14 h-14 rounded-2xl gold-gradient flex items-center justify-center mx-auto mb-5 shadow-md text-white group-hover:scale-110 transition-transform duration-300">
                {item.icon}
              </div>
              <div className="text-xs font-bold text-amber-500 tracking-widest mb-2">{item.step}</div>
              <h3 className="font-bold text-lg mb-2.5 text-foreground">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">{item.desc}</p>
            </motion.div>
          ))}
        </div>
        {/* "New here?" CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-14 bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-5"
        >
          <div className="text-4xl shrink-0">💡</div>
          <div className="flex-1 text-center sm:text-left">
            <p className="font-bold text-amber-900 text-lg mb-1">New here? Learn how Opinoza works</p>
            <p className="text-sm text-amber-700">Earn coins by just answering questions with one click — no experience needed.</p>
          </div>
          <Link href="/how-it-works">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="shrink-0 px-6 py-3 rounded-xl font-bold text-sm gold-gradient text-white shadow-md hover:opacity-90 transition-opacity"
            >
              See Full Guide →
            </motion.button>
          </Link>
        </motion.div>
      </section>

      {/* ── Blog / Guides ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <SectionHeader>
          <div className="flex items-end justify-between mb-7 gap-4">
            <div>
              <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Learn</div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground">Guides &amp; Articles</h2>
            </div>
            <Link href="/blog">
              <motion.button
                whileHover={{ x: 3 }}
                className="text-sm font-semibold text-amber-600 hover:text-amber-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                All articles
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </motion.button>
            </Link>
          </div>
        </SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { href: "/blog/opinoza-how-it-works", tag: "Guide", title: "What Is Opinoza and How Does It Work?", blurb: "A plain-English walkthrough of the platform — who it's for, how earning works, and how to get started." },
            { href: "/blog/earn-money-opinion-platforms", tag: "Strategy", title: "How to Earn Money Using Opinion Platforms", blurb: "The strategies that actually move the needle on opinion platforms — without wasting your time." },
            { href: "/blog/best-survey-apps-2026", tag: "Comparison", title: "Best Survey Apps in 2026", blurb: "An honest comparison of the top platforms by pay rate, payout speed, and ease of use." },
          ].map((item, i) => (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.1, duration: 0.45 }}
            >
              <Link href={item.href}>
                <div className="group h-full bg-card border border-card-border rounded-2xl p-5 cursor-pointer card-hover flex flex-col">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 self-start mb-3">{item.tag}</span>
                  <h3 className="font-bold text-foreground text-sm leading-snug mb-2 flex-1 group-hover:text-amber-700 transition-colors">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.blurb}</p>
                  <div className="mt-3 text-xs font-semibold text-amber-600 flex items-center gap-1">
                    Read →
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="navy-gradient-deep py-16 sm:py-20 px-4 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {FLOATERS.slice(0, 8).map((f, i) => (
            <motion.div key={i} className="absolute text-amber-400"
              style={{ left: `${f.x}%`, top: `${f.y}%` }}
              animate={{ y: [0, -12, 0], opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: f.dur, repeat: Infinity, delay: f.delay }}>
              <StarIcon size={14} />
            </motion.div>
          ))}
        </div>
        <div className="max-w-2xl mx-auto text-center relative z-10">
          {isSignedIn ? (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-bold mb-6 tracking-wide uppercase">
                Grow Your Earnings
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 tracking-tight">Boost Your Earnings 🚀</h2>
              <p className="text-blue-200/90 mb-8 max-w-md mx-auto leading-relaxed">
                Share your invite link and earn rewards every time a friend joins and answers questions.
              </p>
              <motion.button
                onClick={() => navigate("/invite")}
                whileHover={{ scale: 1.04, boxShadow: "0 8px 32px rgba(245,158,11,0.5)" }}
                whileTap={{ scale: 0.96 }}
                className="px-10 py-4 rounded-xl font-bold text-lg gold-gradient text-white shadow-xl transition-all"
              >
                Invite &amp; Earn More →
              </motion.button>
              <p className="mt-4 text-sm text-amber-300/80 font-medium">
                Invite friends and earn rewards from their activity 💰
              </p>
            </>
          ) : (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-bold mb-6 tracking-wide uppercase">
                Get Started Today
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 tracking-tight">Ready to Start Earning?</h2>
              <p className="text-blue-200/90 mb-8 max-w-md mx-auto leading-relaxed">
                Join users sharing their insights every day and getting rewarded — no experience required.
              </p>
              <Link href="/sign-up">
                <motion.button
                  whileHover={{ scale: 1.04, boxShadow: "0 8px 32px rgba(245,158,11,0.5)" }}
                  whileTap={{ scale: 0.96 }}
                  className="px-10 py-4 rounded-xl font-bold text-lg gold-gradient text-white shadow-xl transition-all"
                >
                  Create Free Account →
                </motion.button>
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
