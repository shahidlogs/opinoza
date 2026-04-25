import { Link } from "wouter";
import { motion } from "framer-motion";
import { usePageMeta } from "@/lib/page-meta";

const ARTICLES = [
  {
    slug: "/blog/opinoza-how-it-works",
    tag: "Guide",
    title: "What Is Opinoza and How Does It Work?",
    excerpt:
      "A deep dive into Opinoza — the reward-based Q&A platform where sharing your honest opinion earns you real money. Learn how it works, who it's for, and how to get started today.",
    readTime: "7 min read",
    date: "April 21, 2026",
  },
  {
    slug: "/blog/earn-money-opinion-platforms",
    tag: "Strategy",
    title: "How to Earn Money Online Using Opinion Platforms",
    excerpt:
      "Opinion platforms are one of the simplest, most accessible ways to earn extra income online. Discover how they work, what actually pays, and the strategies that help you earn more without wasting time.",
    readTime: "8 min read",
    date: "April 21, 2026",
  },
  {
    slug: "/blog/best-survey-apps-2026",
    tag: "Comparison",
    title: "Best Survey & Opinion Apps in 2026",
    excerpt:
      "Not all opinion apps are created equal. We compare the top survey and reward platforms of 2026 — honest pay rates, payout methods, user experience, and which ones are actually worth your time.",
    readTime: "9 min read",
    date: "April 21, 2026",
  },
];

export default function BlogIndex() {
  usePageMeta(
    "Blog – Opinoza | Guides, Tips & Earning Strategies",
    "Read Opinoza's blog for guides on earning money online, how opinion platforms work, and the best survey apps in 2026.",
    "https://opinoza.com/blog",
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-10">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">Blog</div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Guides &amp; Articles</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-xl">
            Tips, guides, and insights on earning money online through opinion platforms, surveys, and Opinoza.
          </p>
        </div>

        <div className="space-y-5">
          {ARTICLES.map((article, i) => (
            <motion.div
              key={article.slug}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Link href={article.slug}>
                <div className="group bg-card border border-card-border rounded-2xl p-6 cursor-pointer card-hover">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {article.tag}
                    </span>
                    <span className="text-xs text-muted-foreground">{article.readTime}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">· {article.date}</span>
                  </div>
                  <h2 className="font-bold text-foreground text-lg leading-snug mb-2 group-hover:text-amber-700 transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{article.excerpt}</p>
                  <div className="mt-4 text-sm font-semibold text-amber-600 group-hover:text-amber-700 transition-colors flex items-center gap-1">
                    Read article
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
