import { motion } from "framer-motion";
import { Link } from "wouter";

// ─── Edit these constants to update displayed amounts ─────────────────────────
const EARN = {
  invite:         { label: "Invite a new user",                          amount: "$0.20", cents: "20¢" },
  answer:         { label: "Answer any question",                        amount: "$0.01", cents: "1¢"  },
  receiveAnswer:  { label: "Someone answers your question",              amount: "$0.005", cents: "0.5¢" },
  referralAnswer: { label: "Your invited friend answers a question",     amount: "$0.005", cents: "0.5¢" },
} as const;

const SPEND = {
  createQuestion: { label: "Create a custom question",                   cost: "$0.25",  cents: "25¢",  note: "Paid upfront when submitting your question for review." },
  flagPenalty:    { label: "Short-answer question flagged & not fixed",  cost: "$0.10",  cents: "10¢",  note: "If a flagged answer goes unfixed within the allowed window, a $0.10 penalty may apply." },
  rejectedKept:   { label: "Review fee when a question is rejected",     cost: "$0.05",  cents: "5¢",   note: "$0.20 is refunded. A $0.05 fee is kept to cover the review cost." },
} as const;
// ─────────────────────────────────────────────────────────────────────────────

function EarnCard({ emoji, label, amount, cents, delay }: {
  emoji: string; label: string; amount: string; cents: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="flex items-center gap-4 bg-white border border-emerald-100 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all"
    >
      <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl shrink-0">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{label}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-extrabold text-emerald-600 leading-none">+{amount}</p>
        <p className="text-xs text-emerald-500 mt-0.5">{cents} per action</p>
      </div>
    </motion.div>
  );
}

function SpendCard({ emoji, label, cost, note, delay }: {
  emoji: string; label: string; cost: string; note: string; delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay }}
      className="flex items-start gap-4 bg-white border border-rose-100 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md hover:border-rose-300 transition-all"
    >
      <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-xl shrink-0 mt-0.5">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{label}</p>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{note}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg font-extrabold text-rose-500 leading-none">{cost}</p>
      </div>
    </motion.div>
  );
}

function SectionBadge({ color, label }: { color: "green" | "red"; label: string }) {
  return (
    <span className={`inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-3 ${
      color === "green"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-rose-100 text-rose-600"
    }`}>
      {label}
    </span>
  );
}

export default function HowEarningsWork() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">

      {/* ── Hero ── */}
      <section className="max-w-2xl mx-auto px-4 pt-14 pb-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 text-3xl mb-6 shadow-sm">
            💰
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
            How Earnings Work
          </h1>
          <p className="text-base sm:text-lg text-gray-500 leading-relaxed max-w-xl mx-auto">
            Opinoza rewards you for contributing quality opinions. Here's a clear, honest breakdown of every way you can earn — and every cost you might encounter.
          </p>
        </motion.div>
      </section>

      <div className="max-w-2xl mx-auto px-4 pb-20 space-y-12">

        {/* ── SECTION 1: How You Earn ── */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-5">
            <SectionBadge color="green" label="Earn" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
              How You Earn Money 🌱
            </h2>
            <p className="text-sm text-gray-500">
              Every quality action on Opinoza puts real money in your wallet.
            </p>
          </div>

          {/* Summary pill */}
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 mb-5">
            <span className="text-2xl">✅</span>
            <p className="text-sm text-emerald-800 font-medium leading-snug">
              Earnings are added to your wallet instantly after each qualifying action — no waiting period.
            </p>
          </div>

          <div className="space-y-3">
            <EarnCard emoji="👥" label={EARN.invite.label}         amount={EARN.invite.amount}         cents={EARN.invite.cents}         delay={0.05} />
            <EarnCard emoji="✍️" label={EARN.answer.label}         amount={EARN.answer.amount}         cents={EARN.answer.cents}         delay={0.10} />
            <EarnCard emoji="📥" label={EARN.receiveAnswer.label}  amount={EARN.receiveAnswer.amount}  cents={EARN.receiveAnswer.cents}  delay={0.15} />
            <EarnCard emoji="🔗" label={EARN.referralAnswer.label} amount={EARN.referralAnswer.amount} cents={EARN.referralAnswer.cents} delay={0.20} />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
            className="mt-5 bg-emerald-50 border-l-4 border-emerald-400 rounded-r-xl px-5 py-4"
          >
            <p className="text-sm text-emerald-800 leading-relaxed">
              <strong>The more quality activity you contribute to Opinoza, the more you can earn.</strong> Invite friends, answer daily, and create engaging questions to maximize your rewards.
            </p>
          </motion.div>
        </motion.section>

        {/* ── Divider ── */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Costs & Penalties</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* ── SECTION 2: Where Money Is Spent ── */}
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <div className="mb-5">
            <SectionBadge color="red" label="Costs" />
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
              Where Your Money Is Spent 🛡️
            </h2>
            <p className="text-sm text-gray-500">
              These rules exist to keep Opinoza fair, clean, and high quality for everyone.
            </p>
          </div>

          {/* Summary pill */}
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4 mb-5">
            <span className="text-2xl">⚠️</span>
            <p className="text-sm text-rose-800 font-medium leading-snug">
              Costs and penalties are rare and avoidable. Simply submit quality questions and respond to admin feedback promptly.
            </p>
          </div>

          <div className="space-y-3">
            <SpendCard
              emoji="📝"
              label={SPEND.createQuestion.label}
              cost={SPEND.createQuestion.cost}
              note={SPEND.createQuestion.note}
              delay={0.05}
            />
            <SpendCard
              emoji="🚩"
              label={SPEND.flagPenalty.label}
              cost={SPEND.flagPenalty.cost}
              note={SPEND.flagPenalty.note}
              delay={0.10}
            />

            {/* Rejection breakdown card */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="bg-white border border-rose-100 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md hover:border-rose-300 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-xl shrink-0 mt-0.5">
                  ❌
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 leading-snug mb-3">
                    If a question is rejected by the admin
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">↩️</span>
                        <span className="text-sm text-emerald-800 font-medium">Refunded to your wallet</span>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-600">+$0.20</span>
                    </div>
                    <div className="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🏛️</span>
                        <span className="text-sm text-rose-700 font-medium">Review fee (kept)</span>
                      </div>
                      <span className="text-sm font-extrabold text-rose-500">−$0.05</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-5 bg-rose-50 border-l-4 border-rose-400 rounded-r-xl px-5 py-4"
          >
            <p className="text-sm text-rose-800 leading-relaxed">
              <strong>These rules help keep Opinoza clean, fair, and high quality.</strong> Questions that follow our guidelines are approved quickly and start earning right away.
            </p>
          </motion.div>
        </motion.section>

        {/* ── FAQ quick-ref ── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-6 sm:p-8"
        >
          <h3 className="text-lg font-extrabold text-amber-900 mb-5">Quick Reference</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "👥", label: "Invite friend",             value: "+$0.20", green: true  },
              { icon: "✍️", label: "Answer question",           value: "+$0.01", green: true  },
              { icon: "📥", label: "Receive answer",            value: "+$0.005", green: true },
              { icon: "🔗", label: "Friend answers",            value: "+$0.005", green: true },
              { icon: "📝", label: "Create question",           value: "−$0.25",  green: false },
              { icon: "🚩", label: "Flag penalty",              value: "−$0.10",  green: false },
              { icon: "↩️", label: "Rejected → refund",         value: "+$0.20",  green: true  },
              { icon: "🏛️", label: "Rejected → review fee",    value: "−$0.05",  green: false },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between bg-white rounded-xl px-4 py-2.5 border border-amber-100">
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <span>{item.icon}</span>{item.label}
                </span>
                <span className={`text-sm font-extrabold ${item.green ? "text-emerald-600" : "text-rose-500"}`}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── CTA ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-muted-foreground text-sm mb-5">
            Ready to start earning? It takes less than 60 seconds to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/questions">
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="w-full sm:w-auto px-7 py-3 rounded-xl font-bold text-sm gold-gradient text-white shadow-md hover:opacity-90 transition-opacity"
              >
                Start Answering →
              </motion.button>
            </Link>
            <Link href="/sign-up">
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="w-full sm:w-auto px-7 py-3 rounded-xl font-bold text-sm border border-border text-foreground hover:bg-muted transition-colors"
              >
                Create Free Account
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
