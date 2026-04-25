import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetWalletQueryKey } from "@workspace/api-client-react";

// ── Priority ordering ──────────────────────────────────────────────────────────
const PRIORITY_KEYWORDS = ["full name", "city", "age group", "gender", "country"];
const BASE_PROFILE_REWARD = 2;

function priorityOf(q: { title: string }): number {
  const t = q.title.toLowerCase();
  const idx = PRIORITY_KEYWORDS.findIndex(kw => t.includes(kw));
  return idx === -1 ? PRIORITY_KEYWORDS.length : idx;
}

// ── Star rating ────────────────────────────────────────────────────────────────
function StarRating({ value, onChange, readonly = false }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hovered, setHovered] = useState(0);
  const labels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
  return (
    <div className="max-w-full overflow-hidden">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star} type="button"
            onClick={() => !readonly && onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(0)}
            disabled={readonly}
            className={`shrink-0 transition-all ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"}`}
          >
            <svg width="28" height="28" className="sm:w-[34px] sm:h-[34px] transition-colors" viewBox="0 0 24 24"
              fill={(hovered || value) >= star ? "hsl(43 96% 56%)" : "none"}
              stroke="hsl(43 96% 56%)" strokeWidth="1.5"
            >
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
            </svg>
          </button>
        ))}
      </div>
      {!readonly && (value > 0 || hovered > 0) && (
        <p className="text-sm font-semibold text-amber-600 mt-1.5">{labels[hovered || value]}</p>
      )}
    </div>
  );
}

// ── Text stats ─────────────────────────────────────────────────────────────────
function useTextStats(questionId: number, enabled: boolean) {
  const [data, setData] = useState<{ groups: { label: string; count: number; percentage: number }[]; total: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/questions/${questionId}/text-stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {});
  }, [questionId, enabled]);
  return data;
}

function TextStats({ questionId, userLabel, totalAnswers }: { questionId: number; userLabel: string; totalAnswers: number }) {
  const data = useTextStats(questionId, true);
  if (!data || data.groups.length === 0) {
    return <p className="text-sm text-muted-foreground mt-3">{totalAnswers} {totalAnswers === 1 ? "person has" : "people have"} answered.</p>;
  }
  const userKey = userLabel.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How others answered</p>
      {data.groups.map(g => {
        const isOwn = g.label !== "Other" && g.label.toLowerCase().replace(/\s+/g, " ").trim() === userKey;
        return (
          <div key={g.label}>
            <div className="flex justify-between text-sm mb-1">
              <span className={`font-medium ${isOwn ? "text-amber-700" : "text-foreground"}`}>
                {g.label}{isOwn && <span className="ml-1.5 text-xs text-amber-500">(your answer)</span>}
              </span>
              <span className="text-muted-foreground text-xs">{g.percentage}% ({g.count})</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${g.percentage}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
                className={`h-full rounded-full ${isOwn ? "gold-gradient" : "bg-blue-400"}`} />
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">{data.total} total answers</p>
    </div>
  );
}

function PollStats({ results, userVote, total }: { results: { option: string; count: number; percentage: number }[]; userVote: string; total: number }) {
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How others voted</p>
      {results.map(r => (
        <div key={r.option}>
          <div className="flex justify-between text-sm mb-1">
            <span className={`font-medium ${r.option === userVote ? "text-amber-700" : "text-foreground"}`}>
              {r.option}{r.option === userVote && <span className="ml-1.5 text-xs text-amber-500">(your vote)</span>}
            </span>
            <span className="text-muted-foreground text-xs">{r.percentage}% ({r.count})</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div initial={{ width: 0 }} animate={{ width: `${r.percentage}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
              className={`h-full rounded-full ${r.option === userVote ? "gold-gradient" : "bg-blue-400"}`} />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{total} total votes</p>
    </div>
  );
}

function RatingStats({ avg, total, userRating }: { avg: number; total: number; userRating: number }) {
  return (
    <div className="mt-4 flex items-center gap-5">
      <div className="text-center">
        <div className="text-3xl font-bold text-amber-500">{avg.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">Average</div>
      </div>
      <div>
        <StarRating value={Math.round(avg)} readonly />
        <p className="text-xs text-muted-foreground mt-1">Based on {total} rating{total !== 1 ? "s" : ""} · you rated {userRating}/5</p>
      </div>
    </div>
  );
}

// ── Profile question card ──────────────────────────────────────────────────────
type ProfileQuestion = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  pollOptions?: string[] | null;
  totalAnswers: number;
  userHasAnswered: boolean;
  userAnswer?: any;
  pollResults?: { option: string; count: number; percentage: number }[] | null;
  ratingAverage?: number | null;
};

function ProfileQuestionCard({ question, onAnswered, nameLocked }: { question: ProfileQuestion; onAnswered: (id: number) => void; nameLocked?: boolean }) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";

  const [answered, setAnswered] = useState(question.userHasAnswered);
  const [currentAnswer, setCurrentAnswer] = useState<any>(question.userAnswer ?? null);
  const [pollResults, setPollResults] = useState(question.pollResults ?? null);
  const [ratingAvg, setRatingAvg] = useState(question.ratingAverage ?? null);
  const [totalAnswers, setTotalAnswers] = useState(question.totalAnswers);

  const [answerText, setAnswerText] = useState(question.userAnswer?.answerText ?? "");
  const [pollOption, setPollOption] = useState(question.userAnswer?.pollOption ?? "");
  const [rating, setRating] = useState(question.userAnswer?.rating ?? 0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earnedCents, setEarnedCents] = useState(0);
  const [showEarned, setShowEarned] = useState(false);
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isNameQuestion = question.title.toLowerCase().includes("full name");

  const canSubmit = (
    (question.type === "short_answer" && answerText.trim().length > 0 && answerText.trim().length <= 50) ||
    (question.type === "poll" && pollOption !== "") ||
    (question.type === "rating" && rating > 0)
  );

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${base}/api/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          questionId: question.id,
          answerText: question.type === "short_answer" ? answerText.trim() : null,
          pollOption: question.type === "poll" ? pollOption : null,
          rating: question.type === "rating" ? rating : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Submission failed"); return; }
      setAnswered(true);
      setEarnedCents(data.earnedCents ?? BASE_PROFILE_REWARD);
      setShowEarned(true);
      setCurrentAnswer({ ...data.answer, answerText: answerText.trim() || null, pollOption: pollOption || null, rating: rating || null });
      setTotalAnswers(t => t + 1);
      if (data.pollResults) setPollResults(data.pollResults);
      if (data.ratingAverage) setRatingAvg(data.ratingAverage);
      setTimeout(() => setShowEarned(false), 3000);
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      window.dispatchEvent(new CustomEvent("coin-earned", { detail: { cents: data.earnedCents } }));
      onAnswered(question.id);
      if (question.type !== "short_answer") {
        const qRes = await fetch(`${base}/api/questions/${question.id}`);
        if (qRes.ok) { const qData = await qRes.json(); if (qData.pollResults) setPollResults(qData.pollResults); if (qData.ratingAverage) setRatingAvg(qData.ratingAverage); }
      }
    } catch { setError("Network error — please try again"); }
    finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    const answerId = currentAnswer?.id ?? question.userAnswer?.id;
    if (!answerId) return;
    setUpdating(true); setUpdateError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${base}/api/answers/${answerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          answerText: question.type === "short_answer" ? answerText.trim() : undefined,
          pollOption: question.type === "poll" ? pollOption : undefined,
          rating: question.type === "rating" ? rating : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); setUpdateError(d.error || "Update failed"); return; }
      setCurrentAnswer((prev: any) => ({ ...prev, answerText: answerText.trim() || null, pollOption: pollOption || null, rating: rating || null }));
      setEditing(false);
      if (question.type !== "short_answer") {
        const qRes = await fetch(`${base}/api/questions/${question.id}`);
        if (qRes.ok) { const qData = await qRes.json(); if (qData.pollResults) setPollResults(qData.pollResults); if (qData.ratingAverage) setRatingAvg(qData.ratingAverage); }
      }
    } catch { setUpdateError("Network error"); }
    finally { setUpdating(false); }
  };

  const startEdit = () => {
    setAnswerText(currentAnswer?.answerText ?? "");
    setPollOption(currentAnswer?.pollOption ?? "");
    setRating(currentAnswer?.rating ?? 0);
    setUpdateError(null);
    setEditing(true);
  };

  const answerDisplay = currentAnswer
    ? (currentAnswer.answerText || currentAnswer.pollOption || (currentAnswer.rating ? `${currentAnswer.rating}/5` : null))
    : null;

  if (answered && !editing) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-card-border rounded-2xl p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              {question.type === "short_answer" ? "Short Answer" : question.type === "poll" ? "Poll" : "Rating"}
            </p>
            <h3 className="font-semibold text-foreground mb-1 leading-snug">{question.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="hsl(142 76% 36%)" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <span className="text-sm text-green-700 font-medium truncate">
                {answerDisplay ? `"${answerDisplay}"` : "Answered"}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <AnimatePresence>
              {showEarned && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="text-sm font-bold text-amber-600">+{earnedCents}¢ earned!</motion.span>
              )}
            </AnimatePresence>
            {isNameQuestion && nameLocked ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Locked
              </span>
            ) : (
              <button onClick={startEdit}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors">
                Edit
              </button>
            )}
          </div>
        </div>
        {!isNameQuestion && question.type === "short_answer" && currentAnswer?.answerText && (
          <TextStats questionId={question.id} userLabel={currentAnswer.answerText} totalAnswers={totalAnswers} />
        )}
        {!isNameQuestion && question.type === "poll" && pollResults && currentAnswer?.pollOption && (
          <PollStats results={pollResults} userVote={currentAnswer.pollOption} total={totalAnswers} />
        )}
        {!isNameQuestion && question.type === "rating" && ratingAvg != null && currentAnswer?.rating && (
          <RatingStats avg={ratingAvg} total={totalAnswers} userRating={currentAnswer.rating} />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-card-border rounded-2xl p-5 sm:p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            {question.type === "short_answer" ? "Short Answer" : question.type === "poll" ? "Poll" : "Rating"}
          </p>
          <h3 className="font-semibold text-foreground leading-snug">{question.title}</h3>
          {question.description && <p className="text-sm text-muted-foreground mt-1">{question.description}</p>}
        </div>
        {editing ? (
          <button onClick={() => setEditing(false)}
            className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors shrink-0">
            Cancel
          </button>
        ) : (
          <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
            Earn {BASE_PROFILE_REWARD}¢
          </span>
        )}
      </div>

      {/* Full name payment warning */}
      {isNameQuestion && (
        <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5 text-amber-500">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          Please enter your real correct name. Your payments will be made using this name.
        </div>
      )}

      {question.type === "short_answer" && (
        <div>
          <textarea value={answerText} onChange={e => setAnswerText(e.target.value)}
            placeholder="Your answer..." rows={2} maxLength={50}
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none text-sm"
          />
          <div className={`text-xs text-right mt-1 ${answerText.length > 40 ? "text-amber-600" : "text-muted-foreground"}`}>
            {answerText.length}/50
          </div>
        </div>
      )}

      {question.type === "poll" && question.pollOptions && (
        <div className="space-y-2">
          {question.pollOptions.map(opt => (
            <label key={opt}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                pollOption === opt ? "border-amber-400 bg-amber-50" : "border-border hover:border-amber-200 hover:bg-muted/50"
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${pollOption === opt ? "border-amber-400 bg-amber-400" : "border-muted-foreground"}`}>
                {pollOption === opt && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
              <input type="radio" name={`poll-${question.id}`} value={opt} checked={pollOption === opt} onChange={() => setPollOption(opt)} className="sr-only" />
              <span className="text-sm font-medium text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {question.type === "rating" && (
        <div className="flex flex-col items-center py-3 gap-2">
          <p className="text-sm text-muted-foreground">Select your rating</p>
          <StarRating value={rating} onChange={setRating} />
        </div>
      )}

      {(error || updateError) && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error || updateError}</p>
      )}

      <button onClick={editing ? handleUpdate : handleSubmit}
        disabled={!canSubmit || submitting || updating}
        className="mt-4 w-full py-3 rounded-xl gold-gradient text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all text-sm"
      >
        {(submitting || updating) ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            {editing ? "Updating..." : "Submitting..."}
          </span>
        ) : editing ? "Update Answer" : `Submit & Earn ${BASE_PROFILE_REWARD}¢`}
      </button>
    </motion.div>
  );
}

// ── Profile page ───────────────────────────────────────────────────────────────
export default function Profile() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { data: me } = useGetMe();
  const queryClient = useQueryClient();

  const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";

  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Phone number ───────────────────────────────────────────────────────────
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneSaved, setPhoneSaved] = useState(false);

  // Sync from server once loaded
  useEffect(() => {
    if (me?.phoneNumber !== undefined && !phoneEditing) {
      setPhoneInput(me.phoneNumber ?? "");
    }
  }, [me?.phoneNumber, phoneEditing]);

  const savePhone = useCallback(async () => {
    setPhoneSaving(true);
    setPhoneError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${base}/api/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ phoneNumber: phoneInput.trim() || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPhoneError(data.error || "Failed to save phone number");
      } else {
        setPhoneEditing(false);
        setPhoneSaved(true);
        setTimeout(() => setPhoneSaved(false), 2500);
        queryClient.invalidateQueries({ queryKey: ["getMe"] });
      }
    } catch {
      setPhoneError("Network error. Please try again.");
    } finally {
      setPhoneSaving(false);
    }
  }, [phoneInput, getToken, base, queryClient]);

  const fetchQuestions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${base}/api/questions/profile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const sorted = [...(data.questions ?? [])].sort((a, b) => priorityOf(a) - priorityOf(b));
        setQuestions(sorted);
      }
    } catch {} finally { setLoading(false); }
  }, [user, getToken, base]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const handleAnswered = (questionId: number) => {
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, userHasAnswered: true } : q));
  };

  const answered = questions.filter(q => q.userHasAnswered);
  const progress = questions.length > 0 ? Math.round((answered.length / questions.length) * 100) : 0;

  const initials = (me?.name?.[0] || user?.firstName?.[0] || user?.username?.[0] || "U").toUpperCase();

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1.5">Answer each question and earn <span className="text-amber-600 font-semibold">2¢</span> per question</p>
      </motion.div>

      {/* Profile header card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex items-center gap-5 bg-card border border-card-border rounded-2xl p-6 mb-6 shadow-sm"
      >
        <div className="w-16 h-16 rounded-2xl gold-gradient flex items-center justify-center text-white text-2xl font-extrabold shadow-md shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-foreground text-lg leading-snug truncate">
            {me?.name || user?.fullName || user?.username || "User"}
          </p>
          <p className="text-sm text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {me?.isAdmin && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full gold-gradient text-white shadow-sm">Admin</span>
            )}
            {(me as any)?.nameLocked && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Name locked
              </span>
            )}
            {(me?.city || me?.ageGroup) && (
              <span className="text-xs text-muted-foreground">
                {[me?.city, me?.ageGroup, me?.gender].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* Phone number card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}
        className="bg-card border border-card-border rounded-2xl p-5 mb-6 shadow-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.8 1h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.59a16 16 0 0 0 5.5 5.5l1.66-1.66a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 14.92z"/>
            </svg>
            <p className="text-sm font-semibold text-foreground">Phone Number</p>
            <span className="text-xs text-muted-foreground">(optional)</span>
          </div>
          {!phoneEditing && (
            <button
              onClick={() => setPhoneEditing(true)}
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors"
            >
              {me?.phoneNumber ? "Edit" : "Add"}
            </button>
          )}
        </div>

        {phoneEditing ? (
          <div className="space-y-3">
            <input
              type="tel"
              value={phoneInput}
              onChange={e => { setPhoneInput(e.target.value); setPhoneError(null); }}
              onKeyDown={e => { if (e.key === "Enter") savePhone(); if (e.key === "Escape") { setPhoneEditing(false); setPhoneInput(me?.phoneNumber ?? ""); } }}
              placeholder="+92 300 0000000"
              autoFocus
              className="w-full px-3 py-2 rounded-xl border border-card-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
            {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
            <div className="flex gap-2">
              <button
                onClick={savePhone}
                disabled={phoneSaving}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold gold-gradient text-white disabled:opacity-60 transition-opacity"
              >
                {phoneSaving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => { setPhoneEditing(false); setPhoneInput(me?.phoneNumber ?? ""); setPhoneError(null); }}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {phoneSaved ? (
              <motion.p key="saved" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm text-green-600 font-medium">
                ✓ Phone number saved
              </motion.p>
            ) : me?.phoneNumber ? (
              <p className="text-sm text-foreground font-medium">{me.phoneNumber}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No phone number added yet</p>
            )}
          </AnimatePresence>
        )}
      </motion.div>

      {/* Progress bar */}
      {questions.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-card border border-card-border rounded-2xl p-5 mb-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-foreground">Profile Completion</p>
            <div className="flex items-center gap-3">
              {answered.length < questions.length && (
                <span className="text-xs font-semibold text-amber-600">
                  {(questions.length - answered.length) * BASE_PROFILE_REWARD}¢ left to earn
                </span>
              )}
              <span className={`text-sm font-bold ${progress === 100 ? "text-green-600" : "text-amber-600"}`}>
                {answered.length}/{questions.length}
              </span>
            </div>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
              className={`h-full rounded-full ${progress === 100 ? "bg-green-500" : "gold-gradient"}`}
            />
          </div>
          {progress === 100 && (
            <p className="text-xs text-green-600 font-medium mt-2">✓ All profile questions answered!</p>
          )}
        </motion.div>
      )}

      {/* Questions list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-card-border rounded-2xl p-5 animate-pulse space-y-3">
              <div className="h-3 bg-muted rounded w-20" />
              <div className="h-5 bg-muted rounded w-3/4" />
              <div className="h-20 bg-muted rounded-xl" />
            </div>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg font-semibold mb-1">No profile questions yet</p>
          <p className="text-sm">Check back soon — questions will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map(q => (
            <ProfileQuestionCard key={q.id} question={q} onAnswered={handleAnswered} nameLocked={!!(me as any)?.nameLocked} />
          ))}
        </div>
      )}

      {/* Privacy note */}
      <div className="mt-8 flex items-start gap-3 bg-amber-50/60 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-amber-500">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <p>
          <strong>Privacy first.</strong> Your answers are only used in aggregated analytics — never shared individually.
        </p>
      </div>
    </div>
  );
}
