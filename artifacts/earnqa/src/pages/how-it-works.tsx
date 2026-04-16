import { motion } from "framer-motion";
import { Link } from "wouter";

const STEPS = [
  {
    number: "01",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
      </svg>
    ),
    title: "Ask a Question",
    color: "from-blue-500 to-blue-600",
    badge: "bg-blue-50 text-blue-700 border-blue-200",
    content: [
      "Create a simple question in seconds — no long writing required.",
      "Your question is reviewed and published for the community.",
    ],
    highlight: {
      icon: "🔒",
      text: "Each question on Opinoza is unique. If your question is approved, only YOU earn from it. No one else can duplicate your question.",
    },
  },
  {
    number: "02",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    title: "Answer with One Click",
    color: "from-green-500 to-emerald-600",
    badge: "bg-green-50 text-green-700 border-green-200",
    content: [
      "Browse any question and answer instantly — poll, star rating, or short text.",
      "No long typing required. Optional: add a short reason if you want.",
    ],
    highlight: {
      icon: "⚡",
      text: "Click and earn coins instantly. It's that simple.",
    },
  },
  {
    number: "03",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: "Get Answers",
    color: "from-violet-500 to-purple-600",
    badge: "bg-violet-50 text-violet-700 border-violet-200",
    content: [
      "Other users answer your question and optionally leave reasons.",
      "Every unique answer from a different person counts toward your earnings.",
    ],
    highlight: {
      icon: "📈",
      text: "More answers = more earnings for you.",
    },
  },
  {
    number: "04",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
      </svg>
    ),
    title: "Share Your Question",
    color: "from-amber-500 to-orange-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    content: [
      "Share your question on WhatsApp, Facebook, Twitter, or copy the link.",
      "The more people that see it, the more answers — and income — you earn.",
    ],
    highlight: {
      icon: "🚀",
      text: "More people = more answers = more income. Share to grow your earnings!",
    },
  },
  {
    number: "05",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
    ),
    title: "Earn Coins",
    color: "from-yellow-400 to-amber-500",
    badge: "bg-yellow-50 text-yellow-700 border-yellow-200",
    content: [
      "You earn a one-time $1 bonus when your question reaches 50 unique answers.",
    ],
    milestones: [
      { answers: "50 answers", reward: "$1 bonus (one-time)" },
    ],
    highlight: {
      icon: "💰",
      text: "Answerers earn 1¢ instantly per answer. As a creator, earn a one-time $1 bonus once your question hits 50 unique answers.",
    },
  },
  {
    number: "06",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
        <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
        <path d="M3 21v-5h5"/>
      </svg>
    ),
    title: "Earn Forever",
    color: "from-teal-500 to-cyan-600",
    badge: "bg-teal-50 text-teal-700 border-teal-200",
    content: [
      "Your question stays live indefinitely.",
      "It keeps earning as long as new people find and answer it.",
    ],
    highlight: {
      icon: "♾️",
      text: "Ask once. Earn forever. Your question is a permanent income source.",
    },
  },
  {
    number: "07",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
      </svg>
    ),
    title: "Withdraw Earnings",
    color: "from-rose-500 to-pink-600",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    content: [
      "Once your balance reaches $10 (1000¢), you can request a withdrawal.",
      "Funds are sent via PayPal, bank transfer, or gift card.",
    ],
    highlight: {
      icon: "💳",
      text: "Minimum withdrawal: $10. Build your balance by answering and asking questions.",
    },
  },
];

const REJECTION_REASONS = [
  {
    icon: "📋",
    title: "Duplicate Question",
    desc: "The same or a very similar question already exists on Opinoza.",
  },
  {
    icon: "❓",
    title: "Unclear or Low-Quality Question",
    desc: "The question is confusing, too vague, or hard to understand.",
  },
  {
    icon: "🚫",
    title: "Spam or Meaningless Content",
    desc: "Random text, nonsense, or content with no real value.",
  },
  {
    icon: "⚠️",
    title: "Offensive or Inappropriate Content",
    desc: "Hate speech, abuse, harmful topics, or adult content.",
  },
  {
    icon: "✂️",
    title: "Too Short or Incomprehensible",
    desc: "The question is too brief or doesn't form a clear, meaningful sentence.",
  },
];

export default function HowItWorks() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold mb-4 tracking-widest uppercase">
          Opinoza Guide
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-foreground mb-3 tracking-tight">How It Works</h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Everything you need to know to start earning on Opinoza.
        </p>
      </motion.div>

      {/* Hero highlight */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="navy-gradient-deep rounded-2xl p-7 sm:p-10 text-white text-center mb-12 relative overflow-hidden"
      >
        <div className="absolute inset-0 opacity-10 pointer-events-none select-none">
          {["💰","⭐","💡","✨","🎯","💎"].map((e, i) => (
            <motion.span
              key={i}
              className="absolute text-2xl"
              style={{ left: `${10 + i * 15}%`, top: `${20 + (i % 2) * 55}%` }}
              animate={{ y: [0, -10, 0], opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 2.5 + i * 0.3, repeat: Infinity, delay: i * 0.4 }}
            >
              {e}
            </motion.span>
          ))}
        </div>
        <div className="relative z-10">
          <div className="text-4xl mb-4">💰</div>
          <h2 className="text-2xl sm:text-3xl font-extrabold mb-3 tracking-tight">
            No blogs. No videos. No hard work.
          </h2>
          <p className="text-blue-100 text-lg font-medium">
            Just click, answer, and earn coins instantly.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-sm font-semibold">
              <span>⚡</span> Instant earnings
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-sm font-semibold">
              <span>🖱️</span> One click to answer
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 px-3.5 py-1.5 rounded-full text-sm font-semibold">
              <span>♾️</span> Earn forever
            </div>
          </div>
        </div>
      </motion.div>

      {/* Steps */}
      <div className="space-y-6 mb-14">
        {STEPS.map((step, i) => (
          <motion.div
            key={step.number}
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: i * 0.05 }}
            className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-5">
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-md shrink-0`}>
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-3 flex-wrap">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${step.badge}`}>
                    Step {step.number}
                  </span>
                  <h2 className="text-xl font-bold text-foreground">{step.title}</h2>
                </div>
                <ul className="space-y-1.5 mb-4">
                  {step.content.map((line, j) => (
                    <li key={j} className="text-muted-foreground text-sm flex items-start gap-2">
                      <svg className="mt-0.5 shrink-0 text-amber-400" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
                      </svg>
                      {line}
                    </li>
                  ))}
                </ul>
                {/* Milestone table for step 5 */}
                {"milestones" in step && step.milestones && (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {step.milestones.map((m) => (
                      <div key={m.answers} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                        <div className="text-xs text-amber-600 font-medium mb-1">{m.answers}</div>
                        <div className="text-base font-extrabold text-amber-700">{m.reward}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Highlight callout */}
                <div className="bg-muted/60 border border-border rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <span className="text-lg leading-none mt-0.5">{step.highlight.icon}</span>
                  <p className="text-sm text-foreground font-medium leading-snug">{step.highlight.text}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Invite & Earn */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 sm:p-8 mb-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(142 71% 45%)" strokeWidth="2.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-emerald-800">Invite &amp; Earn</h2>
            <p className="text-sm text-emerald-600 mt-0.5">Share your link — earn every time someone you refer answers</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {[
            { icon: "🔗", title: "Your personal referral link", desc: "Every account gets a unique invite link you can share anywhere — WhatsApp, social media, email." },
            { icon: "🎉", title: "Earn 10¢–20¢ when they sign up", desc: "Earn 10¢ for each of your first 5 successful invites, then 20¢ for every invite after that. The more you invite, the more you earn per invite." },
            { icon: "⚡", title: "Earn 0.5¢ per answer — forever", desc: "Every time your referred user answers a question, you earn an extra 0.5¢. This keeps adding up as long as they are active." },
            { icon: "💚", title: "No cost to the invited user", desc: "The person you invite doesn't lose anything. They earn normally — your reward is paid by the platform." },
          ].map(item => (
            <div key={item.title} className="bg-white border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
              <div>
                <p className="font-bold text-sm text-foreground mb-0.5">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <span className="text-lg leading-none mt-0.5">💡</span>
          <p className="text-sm text-foreground font-medium leading-snug">
            Find your personal invite link on the <strong>Invite &amp; Earn</strong> page after signing in. Share it once — earn passively every time your referrals stay active.
          </p>
        </div>
      </motion.div>

      {/* Question Guidelines */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8 mb-12"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(38 92% 50%)" strokeWidth="2.5">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-amber-800">Question Guidelines</h2>
            <p className="text-sm text-amber-600 mt-0.5">Follow these to get your question approved quickly</p>
          </div>
        </div>

        {/* Opinion-based requirement */}
        <div className="bg-white border border-amber-200 rounded-xl p-5 mb-4">
          <p className="font-bold text-sm text-foreground mb-3">
            💡 Opinoza is designed for <span className="text-amber-700">opinion-based questions only.</span>
          </p>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Ask what people <em>think</em>, <em>feel</em>, or <em>prefer</em> — not factual or informational questions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-green-700 mb-2 uppercase tracking-wide">✔️ Good examples</p>
              <ul className="space-y-1.5">
                {[
                  "Which country is most powerful?",
                  "How would you rate Qatar Airways?",
                  "Do you believe in God?",
                ].map(ex => (
                  <li key={ex} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className="text-green-500 shrink-0 mt-0.5">✔️</span>
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-red-600 mb-2 uppercase tracking-wide">❌ Not allowed</p>
              <ul className="space-y-1.5">
                {[
                  "What is the capital of France?",
                  "Who invented the telephone?",
                ].map(ex => (
                  <li key={ex} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className="text-red-500 shrink-0 mt-0.5">❌</span>
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {[
            { icon: "🌐", title: "English only", desc: "All questions must be written in English. Questions in other languages will be rejected." },
            { icon: "📊", title: "Choose the right question type", desc: "Poll — let users pick from your options. Rating — let users rate on a 1–5 star scale. Short Answer — ask for a one or two word reply." },
            { icon: "✏️", title: "Keep short answer questions concise", desc: "If you choose Short Answer type, your question should be answerable in one or two words. Avoid open-ended questions that need long explanations." },
            { icon: "💬", title: "Be clear and simple", desc: "Write in plain language. Anyone should be able to read and answer your question in seconds without needing extra context." },
            { icon: "🎯", title: "Make it easy to answer", desc: "The best questions have obvious, natural answers. Avoid double questions, trick questions, or anything that requires research." },
          ].map((item, i) => (
            <div key={i} className="bg-white border border-amber-100 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
              <div>
                <p className="font-bold text-sm text-foreground mb-0.5">{item.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-white border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
          <span className="text-lg leading-none mt-0.5">⭐</span>
          <p className="text-sm text-foreground font-medium leading-snug">
            Questions that follow these guidelines are approved faster and attract more answers — which means more earnings for you.
          </p>
        </div>
      </motion.div>

      {/* Important Rules */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.5 }}
        className="bg-red-50 border border-red-200 rounded-2xl p-6 sm:p-8 mb-12"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-100 border border-red-200 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(0 72% 51%)" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-red-800">Important Rules</h2>
            <p className="text-sm text-red-600 mt-0.5">Read before submitting your question</p>
          </div>
        </div>

        {/* Pre-submission rules */}
        <div className="bg-white border border-red-200 rounded-xl p-4 mb-5">
          <ul className="space-y-2">
            {[
              "Always search before asking — check if a similar question already exists.",
              "Duplicate questions are not allowed under any circumstances.",
              "If a similar question already exists, your question may be rejected and your submission fee will not be refunded.",
            ].map((rule, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-red-800">
                <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">!</span>
                {rule}
              </li>
            ))}
          </ul>
        </div>

        <h3 className="font-bold text-red-800 mb-4 text-sm uppercase tracking-widest">Reasons a question may be rejected:</h3>
        <div className="space-y-3">
          {REJECTION_REASONS.map((r, i) => (
            <div key={i} className="bg-white border border-red-100 rounded-xl p-4 flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">{r.icon}</span>
              <div>
                <p className="font-bold text-sm text-foreground">
                  <span className="text-red-500 mr-1.5">{i + 1}.</span>
                  {r.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <h2 className="text-xl font-extrabold text-center text-foreground mb-6">In a nutshell</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: "👉",
              title: "Ask a unique question",
              desc: "Earn only you — no one else can duplicate it.",
              bg: "bg-blue-50 border-blue-200",
            },
            {
              icon: "👉",
              title: "Others answer",
              desc: "Earn a one-time $1 bonus when your question reaches 50 unique answers.",
              bg: "bg-amber-50 border-amber-200",
            },
            {
              icon: "👉",
              title: "Click & answer",
              desc: "Or just answer questions and earn 1¢ instantly per answer.",
              bg: "bg-green-50 border-green-200",
            },
          ].map((card) => (
            <div key={card.title} className={`${card.bg} border rounded-2xl p-5 text-center`}>
              <div className="text-3xl mb-3">{card.icon}</div>
              <p className="font-bold text-sm text-foreground mb-1">{card.title}</p>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="navy-gradient-deep rounded-2xl p-8 text-white text-center"
      >
        <h2 className="text-2xl font-extrabold mb-2">Ready to start earning?</h2>
        <p className="text-blue-200/90 mb-6 text-sm">
          Join Opinoza — it's free, instant, and requires zero experience.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/sign-up">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="px-8 py-3.5 rounded-xl font-bold gold-gradient text-white shadow-lg text-sm"
            >
              Create Free Account →
            </motion.button>
          </Link>
          <Link href="/questions">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="px-8 py-3.5 rounded-xl font-bold bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-colors"
            >
              Browse Questions
            </motion.button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
