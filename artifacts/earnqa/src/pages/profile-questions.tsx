import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetWalletQueryKey } from "@workspace/api-client-react";

const BASE_PROFILE_REWARD = 2;
const BATCH_SIZE = 5;
const NAME_MIN = 2;
const NAME_MAX = 30;

// ── Star rating (readonly + interactive) ─────────────────────────────────────

function StarRating({ value, onChange, readonly = false }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hovered, setHovered] = useState(0);
  const labels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
  return (
    <div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star} type="button"
            onClick={() => !readonly && onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(0)}
            disabled={readonly}
            className={`transition-all ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"}`}
          >
            <svg width="36" height="36" viewBox="0 0 24 24"
              fill={(hovered || value) >= star ? "hsl(43 96% 56%)" : "none"}
              stroke="hsl(43 96% 56%)" strokeWidth="1.5" className="transition-colors"
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

// ── Inline text-answer stats (skipped for "Name" questions) ──────────────────

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
    return (
      <p className="text-sm text-muted-foreground mt-3">
        {totalAnswers} {totalAnswers === 1 ? "person has" : "people have"} answered this question.
      </p>
    );
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
                {g.label}
                {isOwn && <span className="ml-1.5 text-xs text-amber-500">(your answer)</span>}
              </span>
              <span className="text-muted-foreground text-xs">{g.percentage}% ({g.count})</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${g.percentage}%` }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className={`h-full rounded-full ${isOwn ? "gold-gradient" : "bg-blue-400"}`}
              />
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
              {r.option}
              {r.option === userVote && <span className="ml-1.5 text-xs text-amber-500">(your vote)</span>}
            </span>
            <span className="text-muted-foreground text-xs">{r.percentage}% ({r.count})</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${r.percentage}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className={`h-full rounded-full ${r.option === userVote ? "gold-gradient" : "bg-blue-400"}`}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{total} total votes</p>
    </div>
  );
}

function RatingStats({ avg, total, userRating, notFamiliarCount = 0, userNotFamiliar = false }: { avg: number | null; total: number; userRating: number; notFamiliarCount?: number; userNotFamiliar?: boolean }) {
  return (
    <div className="mt-4 space-y-3">
      {avg != null && total > 0 ? (
        <div className="flex items-center gap-5">
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-500">{avg.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Average</div>
          </div>
          <div>
            <StarRating value={Math.round(avg)} readonly />
            <p className="text-xs text-muted-foreground mt-1">
              Based on {total} rating{total !== 1 ? "s" : ""}
              {userNotFamiliar ? " · you said: not familiar" : userRating > 0 ? ` · you rated ${userRating}/5` : ""}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No ratings yet.</p>
      )}
      {notFamiliarCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
          <span>{notFamiliarCount} user{notFamiliarCount !== 1 ? "s" : ""} said they are not familiar with this</span>
        </div>
      )}
    </div>
  );
}

// ── Single profile question card ─────────────────────────────────────────────

type ProfileQuestion = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  pollOptions?: string[] | null;
  totalAnswers: number;
  userHasAnswered: boolean;
  userAnswer?: {
    id?: number;
    answerText?: string | null;
    pollOption?: string | null;
    rating?: number | null;
    notFamiliar?: boolean;
    reason?: string | null;
  } | null;
  pollResults?: { option: string; count: number; percentage: number }[] | null;
  ratingAverage?: number | null;
  ratingCount?: number;
  notFamiliarCount?: number;
};

function ProfileQuestionCard({
  question,
  onAnswered,
  nameLocked = false,
}: {
  question: ProfileQuestion;
  onAnswered: (questionId: number) => void;
  nameLocked?: boolean;
}) {
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
  const [notFamiliar, setNotFamiliar] = useState(question.userAnswer?.notFamiliar ?? false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earnedCents, setEarnedCents] = useState(0);
  const [showEarned, setShowEarned] = useState(false);

  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isNameQuestion = question.title.toLowerCase().includes("name");
  const textMaxLength = isNameQuestion ? NAME_MAX : 50;

  const nameInputError = isNameQuestion && answerText.trim().length > 0
    ? (answerText.trim().length < NAME_MIN ? `Name must be at least ${NAME_MIN} characters`
      : answerText.trim().length > NAME_MAX ? `Name must be ${NAME_MAX} characters or fewer`
      : /^\d+$/.test(answerText.trim()) ? "Name cannot consist of numbers only"
      : null)
    : null;

  const canSubmit = (
    (question.type === "short_answer" && answerText.trim().length > 0 && !nameInputError && answerText.trim().length <= textMaxLength) ||
    (question.type === "poll" && pollOption !== "") ||
    (question.type === "rating" && (rating > 0 || notFamiliar))
  );

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${base}/api/answers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          questionId: question.id,
          answerText: question.type === "short_answer" ? answerText.trim() : null,
          pollOption: question.type === "poll" ? pollOption : null,
          rating: question.type === "rating" && !notFamiliar ? rating : null,
          ...(question.type === "rating" ? { notFamiliar } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Submission failed"); return; }

      setAnswered(true);
      setEarnedCents(data.earnedCents ?? BASE_PROFILE_REWARD);
      setShowEarned(true);
      setCurrentAnswer({ answerText: answerText.trim() || null, pollOption: pollOption || null, rating: notFamiliar ? null : (rating || null), notFamiliar });
      setTotalAnswers(t => t + 1);

      if (data.pollResults) setPollResults(data.pollResults);
      if (data.ratingAverage) setRatingAvg(data.ratingAverage);

      setTimeout(() => setShowEarned(false), 3000);
      queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
      window.dispatchEvent(new CustomEvent("coin-earned", { detail: { cents: data.earnedCents } }));
      onAnswered(question.id);

      // Refresh stats for poll/rating
      if (question.type !== "short_answer") {
        const qRes = await fetch(`${base}/api/questions/${question.id}`);
        if (qRes.ok) {
          const qData = await qRes.json();
          if (qData.pollResults) setPollResults(qData.pollResults);
          if (qData.ratingAverage) setRatingAvg(qData.ratingAverage);
        }
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!currentAnswer?.id && !question.userAnswer?.id) return;
    const answerId = currentAnswer?.id ?? question.userAnswer?.id;
    setUpdating(true);
    setUpdateError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${base}/api/answers/${answerId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          answerText: question.type === "short_answer" ? answerText.trim() : undefined,
          pollOption: question.type === "poll" ? pollOption : undefined,
          rating: question.type === "rating" && !notFamiliar ? rating : undefined,
          ...(question.type === "rating" ? { notFamiliar } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setUpdateError(d.error || "Update failed");
        return;
      }
      setCurrentAnswer((prev: any) => ({
        ...prev,
        answerText: answerText.trim() || null,
        pollOption: pollOption || null,
        rating: notFamiliar ? null : (rating || null),
        notFamiliar,
      }));
      setEditing(false);

      if (question.type !== "short_answer") {
        const qRes = await fetch(`${base}/api/questions/${question.id}`);
        if (qRes.ok) {
          const qData = await qRes.json();
          if (qData.pollResults) setPollResults(qData.pollResults);
          if (qData.ratingAverage) setRatingAvg(qData.ratingAverage);
        }
      }
    } catch {
      setUpdateError("Network error");
    } finally {
      setUpdating(false);
    }
  };

  const startEdit = () => {
    setAnswerText(currentAnswer?.answerText ?? "");
    setPollOption(currentAnswer?.pollOption ?? "");
    setRating(currentAnswer?.rating ?? 0);
    setNotFamiliar(currentAnswer?.notFamiliar ?? false);
    setUpdateError(null);
    setEditing(true);
  };

  const answerDisplay = currentAnswer
    ? (currentAnswer.notFamiliar ? "Not familiar" : (currentAnswer.answerText || currentAnswer.pollOption || (currentAnswer.rating ? `${currentAnswer.rating}/5` : null)))
    : null;

  if (answered && !editing) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-card-border rounded-2xl p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{question.type === "short_answer" ? "Short Answer" : question.type === "poll" ? "Poll" : "Rating"}</p>
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
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  className="text-sm font-bold text-amber-600"
                >
                  +{earnedCents}¢ earned!
                </motion.span>
              )}
            </AnimatePresence>
            {isNameQuestion && nameLocked ? (
              <span className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground flex items-center gap-1 cursor-default" title="Name is locked after reaching $10 earnings">
                🔒 Locked
              </span>
            ) : (
              <button
                onClick={startEdit}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!isNameQuestion && question.type === "short_answer" && currentAnswer?.answerText && (
          <TextStats questionId={question.id} userLabel={currentAnswer.answerText} totalAnswers={totalAnswers} />
        )}
        {!isNameQuestion && question.type === "poll" && pollResults && currentAnswer?.pollOption && (
          <PollStats results={pollResults} userVote={currentAnswer.pollOption} total={totalAnswers} />
        )}
        {!isNameQuestion && question.type === "rating" && (ratingAvg != null || (question.notFamiliarCount ?? 0) > 0) && (
          <RatingStats
            avg={ratingAvg}
            total={question.ratingCount ?? 0}
            userRating={currentAnswer?.rating ?? 0}
            notFamiliarCount={question.notFamiliarCount ?? 0}
            userNotFamiliar={currentAnswer?.notFamiliar ?? false}
          />
        )}
      </motion.div>
    );
  }

  // Unanswered (or editing) form card
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-card-border rounded-2xl p-5 sm:p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{question.type === "short_answer" ? "Short Answer" : question.type === "poll" ? "Poll" : "Rating"}</p>
          <h3 className="font-semibold text-foreground leading-snug">{question.title}</h3>
          {question.description && <p className="text-sm text-muted-foreground mt-1">{question.description}</p>}
        </div>
        {editing ? (
          <button onClick={() => setEditing(false)} className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors shrink-0">Cancel</button>
        ) : (
          <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0 flex items-center gap-1">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
            Earn {BASE_PROFILE_REWARD}¢
          </span>
        )}
      </div>

      {/* Name question notes */}
      {isNameQuestion && (
        <div className="mb-3 space-y-2">
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-800 leading-relaxed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5 text-blue-500">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            This name will be shown across the platform — on your answers, questions, and profile.
          </div>
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5 text-amber-500">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
            </svg>
            Please enter your real full name with correct spelling. Your payments will be made using this name.
          </div>
        </div>
      )}

      {/* Short Answer */}
      {question.type === "short_answer" && (
        <div>
          <textarea
            value={answerText}
            onChange={e => setAnswerText(e.target.value)}
            placeholder={isNameQuestion ? "Your full name..." : "Your answer..."}
            rows={2}
            maxLength={textMaxLength}
            className={`w-full px-4 py-3 rounded-xl border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 resize-none text-sm ${nameInputError ? "border-red-400 focus:ring-red-400" : "border-input focus:ring-amber-400"}`}
          />
          <div className="flex items-center justify-between mt-1">
            {nameInputError ? (
              <p className="text-xs text-red-600">{nameInputError}</p>
            ) : isNameQuestion ? (
              <p className="text-xs text-muted-foreground">2–30 characters, letters only</p>
            ) : (
              <span />
            )}
            <span className={`text-xs ${answerText.length > textMaxLength - Math.ceil(textMaxLength * 0.1) ? "text-amber-600" : "text-muted-foreground"}`}>
              {answerText.length}/{textMaxLength}
            </span>
          </div>
        </div>
      )}

      {/* Poll */}
      {question.type === "poll" && question.pollOptions && (
        <div className="space-y-2">
          {question.pollOptions.map(opt => (
            <label
              key={opt}
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

      {/* Rating */}
      {question.type === "rating" && (
        <div className="flex flex-col items-center py-3 gap-3">
          <p className="text-sm text-muted-foreground">Select your rating</p>
          <StarRating
            value={notFamiliar ? 0 : rating}
            onChange={(v) => { setRating(v); setNotFamiliar(false); }}
          />
          {rating === 0 && !notFamiliar && (
            <p className="text-xs text-muted-foreground">Click a star to rate</p>
          )}
          <div className="w-full border-t border-border pt-3">
            <button
              type="button"
              onClick={() => { setNotFamiliar(nf => !nf); setRating(0); }}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border text-sm transition-colors ${
                notFamiliar
                  ? "bg-gray-100 border-gray-400 text-gray-700 font-semibold"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              {notFamiliar && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
              )}
              I'm not familiar with this
            </button>
            {!notFamiliar && (
              <p className="text-xs text-muted-foreground text-center mt-1.5">
                If you don't know about this, click here — you'll still earn 2¢.
              </p>
            )}
          </div>
        </div>
      )}

      {(error || updateError) && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">
          {error || updateError}
        </p>
      )}

      <button
        onClick={editing ? handleUpdate : handleSubmit}
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

// ── Profile Questions page ───────────────────────────────────────────────────

export default function ProfileQuestions() {
  const { user } = useUser();
  const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
  const { getToken } = useAuth();

  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleUnanswered, setVisibleUnanswered] = useState(BATCH_SIZE);
  const [justAnswered, setJustAnswered] = useState<Set<number>>(new Set());
  const [nameLocked, setNameLocked] = useState(false);

  // Fetch name-lock status from me endpoint
  useEffect(() => {
    if (!user) return;
    const fetchMe = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${base}/api/users/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setNameLocked(!!data.nameLocked);
        }
      } catch {}
    };
    fetchMe();
  }, [user, getToken, base]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const fetchQuestions = async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${base}/api/questions/profile`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const PRIORITY_KEYWORDS = ["full name", "city", "age group", "gender", "country"];
          const priorityOf = (q: ProfileQuestion) => {
            const t = q.title.toLowerCase();
            const idx = PRIORITY_KEYWORDS.findIndex(kw => t.includes(kw));
            return idx === -1 ? PRIORITY_KEYWORDS.length : idx;
          };
          const sorted = [...(data.questions ?? [])].sort((a, b) => priorityOf(a) - priorityOf(b));
          setQuestions(sorted);
        }
      } catch {}
      finally { setLoading(false); }
    };
    fetchQuestions();
  }, [user, getToken, base]);

  const handleAnswered = (questionId: number) => {
    setJustAnswered(prev => new Set([...prev, questionId]));
    setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, userHasAnswered: true } : q));
  };

  const answered = questions.filter(q => q.userHasAnswered);
  const unanswered = questions.filter(q => !q.userHasAnswered);
  const visibleUnansweredList = unanswered.slice(0, visibleUnanswered);
  const hasMore = unanswered.length > visibleUnanswered;

  const totalEarnable = unanswered.length * BASE_PROFILE_REWARD;
  const progress = questions.length > 0 ? Math.round((answered.length / questions.length) * 100) : 0;

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h2 className="text-xl font-bold mb-3">Sign in to answer profile questions</h2>
        <div className="flex gap-3 justify-center">
          <Link href="/sign-in"><button className="px-6 py-2.5 rounded-xl gold-gradient text-white font-semibold">Sign in</button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Back to profile */}
      <Link href="/profile">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-amber-600 cursor-pointer transition-colors mb-6">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to Profile
        </span>
      </Link>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Profile Questions</h1>
        <p className="text-muted-foreground mt-1.5">
          Answer questions about yourself and earn{" "}
          <span className="text-amber-600 font-semibold">{BASE_PROFILE_REWARD}¢</span> per question
        </p>
      </div>

      {/* Progress card */}
      {questions.length > 0 && (
        <div className="bg-card border border-card-border rounded-2xl p-5 mb-7 shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-foreground">Progress</p>
            <div className="flex items-center gap-3">
              {unanswered.length > 0 && (
                <span className="text-xs font-semibold text-amber-600">
                  Up to {totalEarnable}¢ left to earn
                </span>
              )}
              <span className={`text-sm font-bold ${progress === 100 ? "text-green-600" : "text-amber-600"}`}>{answered.length}/{questions.length}</span>
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
            <p className="text-xs text-green-600 font-medium mt-2">All profile questions answered!</p>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-card-border rounded-2xl p-5 animate-pulse space-y-3">
              <div className="h-3 bg-muted rounded w-20" />
              <div className="h-5 bg-muted rounded w-3/4" />
              <div className="h-20 bg-muted rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {!loading && questions.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 opacity-30">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
          </svg>
          <p className="font-medium">No profile questions available yet.</p>
          <p className="text-sm mt-1">Check back later — the admin will add them soon.</p>
        </div>
      )}

      {/* Unanswered questions (current batch) */}
      {!loading && visibleUnansweredList.length > 0 && (
        <div className="mb-8">
          {answered.length > 0 && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              Next up — {unanswered.length} remaining
            </h2>
          )}
          <div className="space-y-4">
            <AnimatePresence>
              {visibleUnansweredList.map(q => (
                <ProfileQuestionCard key={q.id} question={q} onAnswered={handleAnswered} nameLocked={nameLocked} />
              ))}
            </AnimatePresence>
          </div>

          {hasMore && (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => setVisibleUnanswered(v => v + BATCH_SIZE)}
              className="mt-5 w-full py-3 rounded-xl border-2 border-amber-200 text-amber-700 font-semibold text-sm hover:bg-amber-50 transition-colors"
            >
              Show {Math.min(BATCH_SIZE, unanswered.length - visibleUnanswered)} more questions
            </motion.button>
          )}
        </div>
      )}

      {/* Answered questions */}
      {!loading && answered.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Answered ({answered.length})
          </h2>
          <div className="space-y-4">
            {answered.map(q => (
              <ProfileQuestionCard key={q.id} question={q} onAnswered={handleAnswered} nameLocked={nameLocked} />
            ))}
          </div>
        </div>
      )}

      {/* All answered CTA */}
      {!loading && questions.length > 0 && unanswered.length === 0 && (
        <div className="mt-8 bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
          <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(142 76% 36%)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h3 className="font-bold text-green-800 text-lg mb-1">All done!</h3>
          <p className="text-green-700 text-sm">You've answered all profile questions. Check back later for new ones.</p>
          <Link href="/questions">
            <button className="mt-4 px-6 py-2.5 rounded-xl gold-gradient text-white font-semibold text-sm hover:opacity-90">
              Browse Regular Questions
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}
