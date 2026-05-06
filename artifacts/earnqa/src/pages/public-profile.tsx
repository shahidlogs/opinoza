import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";

const TYPE_ICON: Record<string, string> = {
  short_answer: "✍️",
  poll: "📊",
  rating: "⭐",
};

type PublicQuestion = {
  id: number;
  title: string;
  description: string | null;
  type: string;
  categories: string[] | null;
  totalAnswers: number;
  createdAt: string;
  pollOptions: string[] | null;
};

type PublicProfile = {
  id: number;
  displayName: string;
  joinedLabel: string;
  approvedQuestionsCount: number;
  totalAnswersReceived: number;
  totalInvited: number;
  questions: PublicQuestion[];
};

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center bg-card border border-card-border rounded-2xl px-6 py-4 min-w-[120px]">
      <span className="text-2xl font-extrabold text-foreground tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground mt-1 text-center leading-tight">{label}</span>
    </div>
  );
}

function QuestionRow({ q }: { q: PublicQuestion }) {
  const date = new Date(q.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const cats = q.categories?.slice(0, 2) ?? [];
  return (
    <Link href={`/questions/${q.id}`}>
      <motion.div
        whileHover={{ y: -2 }}
        className="bg-card border border-card-border rounded-2xl p-4 sm:p-5 cursor-pointer hover:border-amber-300 hover:shadow-md transition-all"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-base">{TYPE_ICON[q.type] ?? "❓"}</span>
              {cats.map(c => (
                <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">{c}</span>
              ))}
              <span className="text-xs text-muted-foreground ml-auto shrink-0">{date}</span>
            </div>
            <p className="font-semibold text-foreground text-sm sm:text-base leading-snug">{q.title}</p>
            {q.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{q.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {q.totalAnswers} answer{q.totalAnswers !== 1 ? "s" : ""}
          </span>
          {q.type === "poll" && q.pollOptions && (
            <span className="text-muted-foreground">{q.pollOptions.length} options</span>
          )}
          <span className="ml-auto text-amber-600 font-medium">View →</span>
        </div>
      </motion.div>
    </Link>
  );
}

export default function PublicProfile() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    fetch(`${base}/api/users/${id}/public`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setProfile(d); })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, base]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
        <div className="h-5 w-40 bg-muted rounded-xl animate-pulse" />
        <div className="h-3 w-28 bg-muted rounded-xl animate-pulse" />
        <div className="flex gap-3 mt-4">
          {[1, 2, 3].map(i => <div key={i} className="h-16 w-28 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 56%)" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Profile not found</h1>
        <p className="text-muted-foreground text-sm mb-6">This user doesn't exist or their profile is not available.</p>
        <Link href="/questions">
          <span className="text-sm text-amber-600 hover:underline font-medium cursor-pointer">← Browse questions</span>
        </Link>
      </div>
    );
  }

  const initials = profile.displayName
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Back */}
      <Link href="/questions">
        <span className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-6 inline-flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Browse questions
        </span>
      </Link>

      {/* Profile header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center mb-8"
      >
        {/* Avatar */}
        <div className="w-20 h-20 rounded-full gold-gradient flex items-center justify-center text-white text-2xl font-extrabold shadow-md mb-4 select-none">
          {initials || "?"}
        </div>
        <h1 className="text-2xl font-extrabold text-foreground mb-1">{profile.displayName}</h1>
        <p className="text-sm text-muted-foreground">Joined {profile.joinedLabel}</p>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-3 justify-center flex-wrap mb-10"
      >
        <StatPill label="Questions" value={profile.approvedQuestionsCount} />
        <StatPill label="Answers received" value={profile.totalAnswersReceived} />
        <StatPill label="People invited" value={profile.totalInvited} />
      </motion.div>

      {/* Questions list */}
      <div>
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
          Approved Questions
        </h2>

        {profile.questions.length === 0 ? (
          <div className="bg-card border border-card-border rounded-2xl p-10 text-center text-muted-foreground text-sm">
            No approved questions yet.
          </div>
        ) : (
          <div className="space-y-3">
            {profile.questions.map((q, i) => (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
              >
                <QuestionRow q={q} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
