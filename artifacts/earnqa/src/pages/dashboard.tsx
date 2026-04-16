import { Link } from "wouter";
import { motion } from "framer-motion";
import { useUser } from "@clerk/react";
import { useGetMyStats, useGetMyAnswers, useGetWallet, useGetMe } from "@workspace/api-client-react";

function StatCard({ label, value, sub, icon, accent = false }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-5 border shadow-sm flex flex-col gap-3 ${
        accent
          ? "navy-gradient text-white border-transparent"
          : "bg-card border-card-border"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
        accent ? "bg-white/15" : "bg-amber-50 border border-amber-100"
      }`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-extrabold tracking-tight tabular-nums ${accent ? "text-white" : "text-foreground"}`}>
          {value}
        </div>
        <div className={`text-xs font-medium mt-0.5 ${accent ? "text-blue-200" : "text-muted-foreground"}`}>{label}</div>
        {sub && (
          <div className={`text-xs mt-1 font-medium ${accent ? "text-amber-300" : "text-amber-600"}`}>{sub}</div>
        )}
      </div>
    </motion.div>
  );
}

const TYPE_LABEL: Record<string, string> = { short_answer: "✍️", poll: "📊", rating: "⭐" };

export default function Dashboard() {
  const { user } = useUser();
  const { data: me } = useGetMe();
  const { data: stats, isLoading: statsLoading } = useGetMyStats();
  const { data: answersData } = useGetMyAnswers();
  const { data: wallet } = useGetWallet();

  const recentAnswers = answersData?.answers?.slice(0, 8) ?? [];
  const balance = wallet?.balanceCents ?? 0;
  const totalEarned = stats?.totalEarnedCents ?? 0;
  const firstName = me?.name?.split(" ")[0] || user?.firstName || user?.username || "Earner";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 sm:mb-10"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground font-medium mb-1">Welcome back</p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {firstName} <span className="text-amber-500">👋</span>
            </h1>
          </div>
          <Link href="/questions">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-2.5 rounded-xl gold-gradient text-white text-sm font-bold shadow-sm hover:opacity-90 transition-all"
            >
              Answer & Earn
            </motion.button>
          </Link>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <motion.div transition={{ delay: 0 }}>
          <StatCard
            label="Current Balance"
            value={`${balance}¢`}
            sub={`$${(balance / 100).toFixed(2)}`}
            accent
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>}
          />
        </motion.div>
        <motion.div transition={{ delay: 0.07 }}>
          <StatCard
            label="Total Earned"
            value={`${totalEarned}¢`}
            sub={totalEarned > 0 ? `$${(totalEarned / 100).toFixed(2)} lifetime` : "Answer to start earning"}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-amber-500"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>}
          />
        </motion.div>
        <motion.div transition={{ delay: 0.12 }}>
          <StatCard
            label="Questions Answered"
            value={statsLoading ? "—" : stats?.totalAnswers ?? 0}
            sub={`${stats?.answersThisWeek ?? 0} this week`}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 56%)" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>}
          />
        </motion.div>
        <motion.div transition={{ delay: 0.17 }}>
          <StatCard
            label="Creator Bonus"
            value={`${stats?.creatorBonusCents ?? 0}¢`}
            sub={stats?.questionsCreated ? `From ${stats.questionsCreated} question${stats.questionsCreated !== 1 ? "s" : ""}` : "Create a question"}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 56%)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>}
          />
        </motion.div>
      </div>

      {/* Progress toward withdrawal */}
      {balance > 0 && balance < 1000 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-amber-800">Progress toward $10 withdrawal</p>
            <p className="text-sm font-bold text-amber-700 tabular-nums">{balance} / 1000¢</p>
          </div>
          <div className="h-2.5 bg-amber-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((balance / 1000) * 100, 100)}%` }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }}
              className="h-full rounded-full gold-gradient"
            />
          </div>
          <p className="text-xs text-amber-600 mt-2">{1000 - balance}¢ more to go — that's {1000 - balance} more answers!</p>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div className="mb-10">
        <h2 className="text-base font-bold text-foreground mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              href: "/questions",
              title: "Answer Questions",
              desc: "Earn 1¢ per answer",
              iconBg: "gold-gradient",
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,
            },
            {
              href: "/ask",
              title: "Create a Question",
              desc: "Earn 0.5¢ per answer received",
              iconBg: "bg-blue-500",
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
            },
            {
              href: "/wallet",
              title: "View Wallet",
              desc: balance > 0 ? `Balance: ${balance}¢ ($${(balance / 100).toFixed(2)})` : "Check your balance",
              iconBg: "bg-violet-500",
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
            },
          ].map((action, i) => (
            <Link key={action.href} href={action.href}>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                whileHover={{ y: -2 }}
                className="bg-card border border-card-border rounded-2xl p-5 cursor-pointer hover:shadow-md hover:border-amber-200 transition-all group"
              >
                <div className={`w-10 h-10 rounded-xl ${action.iconBg} flex items-center justify-center mb-3.5 shadow-sm group-hover:scale-110 transition-transform duration-200`}>
                  {action.icon}
                </div>
                <h3 className="font-bold text-foreground text-sm mb-1">{action.title}</h3>
                <p className="text-xs text-muted-foreground leading-snug">{action.desc}</p>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">Recent Activity</h2>
          {recentAnswers.length > 0 && (
            <Link href="/wallet">
              <span className="text-xs text-amber-600 hover:underline font-medium cursor-pointer">View all →</span>
            </Link>
          )}
        </div>

        {recentAnswers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-card border border-card-border rounded-2xl p-10 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 56%)" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>
              </svg>
            </div>
            <p className="font-semibold text-foreground mb-1">No answers yet</p>
            <p className="text-sm text-muted-foreground mb-5">Browse questions and earn your first cent</p>
            <Link href="/questions">
              <motion.button
                whileHover={{ scale: 1.03 }}
                className="px-6 py-2.5 rounded-xl gold-gradient text-white text-sm font-semibold shadow-sm hover:opacity-90 transition-all"
              >
                Browse Questions
              </motion.button>
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-2">
            {recentAnswers.map((ans, i) => (
              <motion.div
                key={ans.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="bg-card border border-card-border rounded-xl px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4 group hover:border-amber-200 hover:shadow-sm transition-all"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0 text-sm">
                  {TYPE_LABEL[ans.type || "short_answer"] || "✍️"}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/questions/${ans.questionId}`}>
                    <span className="font-medium text-foreground hover:text-amber-600 transition-colors line-clamp-1 cursor-pointer text-sm">
                      {ans.questionTitle || "Question"}
                    </span>
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {ans.pollOption ? `Selected: ${ans.pollOption}` : ""}
                    {ans.rating ? `Rated: ${ans.rating}/5 ⭐` : ""}
                    {ans.answerText ? `"${ans.answerText.substring(0, 50)}${ans.answerText.length > 50 ? "…" : ""}"` : ""}
                  </div>
                </div>
                <div className="earn-badge shrink-0">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
                  +1¢
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
