import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Show, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetQuestion,
  getGetQuestionQueryKey,
  useSubmitAnswer,
  getGetWalletQueryKey,
  getGetMyStatsQueryKey,
  getGetMyAnswersQueryKey,
} from "@workspace/api-client-react";

const TYPE_LABELS: Record<string, string> = {
  short_answer: "Short Answer",
  poll: "Poll",
  rating: "Rating",
};

const SHORT_ANSWER_MAX = 50;
const REASON_MAX = 200;

function StarRating({ value, onChange, readonly = false }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  const [hovered, setHovered] = useState(0);
  const labels = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];

  return (
    <div className="max-w-full overflow-hidden">
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => !readonly && onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(0)}
            disabled={readonly}
            className={`shrink-0 transition-all ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110 active:scale-95"}`}
          >
            <svg width="32" height="32" className="sm:w-10 sm:h-10 transition-colors" viewBox="0 0 24 24"
              fill={(hovered || value) >= star ? "hsl(43 96% 56%)" : "none"}
              stroke="hsl(43 96% 56%)"
              strokeWidth="1.5"
            >
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
            </svg>
          </button>
        ))}
      </div>
      {!readonly && (value > 0 || hovered > 0) && (
        <p className="text-center text-sm font-semibold text-amber-600 mt-2">{labels[hovered || value]}</p>
      )}
    </div>
  );
}

function EarningCelebration({ cents }: { cents: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, y: 40 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -30 }}
      transition={{ type: "spring", bounce: 0.5 }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
    >
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-amber-400 px-12 py-10 text-center">
        <motion.div
          animate={{ rotate: [0, -10, 10, -5, 5, 0], scale: [1, 1.2, 1.1, 1.15, 1] }}
          transition={{ duration: 0.6 }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="hsl(43 96% 56%)" className="mx-auto">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
          </svg>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="text-3xl font-bold text-amber-600 mt-3">+{cents}¢ Earned!</div>
          <div className="text-muted-foreground text-sm mt-1">Great answer! Keep earning.</div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── Answer suggestion autocomplete ──────────────────────────────────────────

function useAnswerSuggestions(questionId: number, query: string) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(
          `${base}/api/questions/${questionId}/suggestions?q=${encodeURIComponent(query.trim())}`,
        );
        if (!res.ok) { setSuggestions([]); return; }
        const data = await res.json();
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [questionId, query]);

  return suggestions;
}

interface AnswerSuggestInputProps {
  questionId: number;
  value: string;
  onChange: (v: string) => void;
  maxLength: number;
}

function AnswerSuggestInput({ questionId, value, onChange, maxLength }: AnswerSuggestInputProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestions = useAnswerSuggestions(questionId, value);

  // Reset active index when suggestions change
  useEffect(() => { setActiveIdx(-1); }, [suggestions]);

  // Open dropdown when we have results and user is typing
  useEffect(() => {
    setOpen(suggestions.length > 0 && value.trim().length >= 2);
  }, [suggestions, value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const pick = useCallback((text: string) => {
    onChange(text);
    setOpen(false);
    textareaRef.current?.focus();
  }, [onChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Share your honest answer here..."
        rows={3}
        maxLength={maxLength}
        autoComplete="off"
        className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
      />

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 left-0 right-0 mt-1 bg-white border border-amber-200 rounded-xl shadow-lg overflow-hidden"
            role="listbox"
          >
            {suggestions.map((s, i) => (
              <li
                key={s}
                role="option"
                aria-selected={activeIdx === i}
                onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`px-4 py-2.5 text-sm cursor-pointer transition-colors flex items-center gap-2 ${
                  activeIdx === i
                    ? "bg-amber-50 text-amber-800"
                    : "text-foreground hover:bg-amber-50 hover:text-amber-800"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 opacity-40">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span className="truncate">{s}</span>
              </li>
            ))}
            <li className="px-4 py-2 text-xs text-muted-foreground border-t border-border bg-muted/30">
              Existing answers · or keep typing to write your own
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Short-answer grouped stats ───────────────────────────────────────────────

interface TextStatGroup {
  label: string;
  count: number;
  percentage: number;
}

function useShortAnswerStats(questionId: number, enabled: boolean) {
  const [data, setData] = useState<{ groups: TextStatGroup[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/questions/${questionId}/text-stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [questionId, enabled]);

  return { data, loading };
}

function ShortAnswerStats({
  questionId,
  userAnswerText,
  totalAnswers,
}: {
  questionId: number;
  userAnswerText: string | null | undefined;
  totalAnswers: number;
}) {
  const { data, loading } = useShortAnswerStats(questionId, true);

  if (loading) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm mb-5 space-y-3 animate-pulse">
        <div className="h-5 bg-muted rounded w-40" />
        {[1, 2, 3].map(i => (
          <div key={i}>
            <div className="flex justify-between mb-1.5">
              <div className="h-4 bg-muted rounded w-32" />
              <div className="h-4 bg-muted rounded w-16" />
            </div>
            <div className="h-2.5 bg-muted rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-4 text-center text-sm text-muted-foreground mb-5">
        {totalAnswers} {totalAnswers === 1 ? "person has" : "people have"} shared their perspective on this question.
      </div>
    );
  }

  const userKey = userAnswerText?.toLowerCase().replace(/\s+/g, " ").trim() ?? "";

  return (
    <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm mb-5">
      <h3 className="font-bold text-lg mb-5">Answer Breakdown</h3>
      <div className="space-y-4">
        {data.groups.map(g => {
          const isOwn = g.label !== "Other" && g.label.toLowerCase().replace(/\s+/g, " ").trim() === userKey;
          return (
            <div key={g.label}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className={`font-medium ${isOwn ? "text-amber-700" : "text-foreground"}`}>
                  {g.label}
                  {isOwn && <span className="ml-1.5 text-xs text-amber-500">(your answer)</span>}
                </span>
                <span className="text-muted-foreground">{g.percentage}% ({g.count})</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${g.percentage}%` }}
                  transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
                  className={`h-full rounded-full ${isOwn ? "gold-gradient" : "bg-blue-400"}`}
                />
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground mt-2">{data.total} total {data.total === 1 ? "answer" : "answers"}</p>
      </div>
    </div>
  );
}

// ── Answers Feed ─────────────────────────────────────────────────────────────

interface AnswerEntry {
  id: number;
  isOwn: boolean;
  displayName: string;
  answerText: string | null;
  pollOption: string | null;
  rating: number | null;
  notFamiliar: boolean;
  reason: string | null;
  createdAt: string;
}

const FLAG_REASONS = [
  "Meaningless or unclear",
  "Spam or repeated text",
  "Abusive or inappropriate",
  "Spelling/capitalization issue",
] as const;

function FlagModal({ answerId, onClose, onFlagged }: { answerId: number; onClose: () => void; onFlagged: () => void }) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError("");
    try {
      const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/answers/${answerId}/flag`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit flag"); return; }
      onFlagged();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-foreground">Flag this answer</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Why are you flagging this answer?</p>
        <div className="space-y-2">
          {FLAG_REASONS.map(r => (
            <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reason === r ? "border-red-300 bg-red-50" : "border-border hover:border-red-200 hover:bg-red-50/50"}`}>
              <input type="radio" name="flag-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-red-500" />
              <span className="text-sm text-foreground">{r}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
        <div className="flex gap-3 mt-5">
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting…" : "Submit Flag"}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AnswersFeed({
  questionId,
  questionType,
  refreshKey,
}: {
  questionId: number;
  questionType: string;
  refreshKey: number;
}) {
  const { user } = useUser();
  const [answers, setAnswers] = useState<AnswerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [flagModalId, setFlagModalId] = useState<number | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/questions/${questionId}/answers`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : { answers: [] }))
      .then(d => { setAnswers(Array.isArray(d.answers) ? d.answers : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [questionId, refreshKey]);

  const getAnswerDisplay = (a: AnswerEntry): { verb: string; label: string; isNotFamiliar: boolean } => {
    if (questionType === "rating" && a.notFamiliar) return { verb: "said", label: "Not familiar with this", isNotFamiliar: true };
    if (questionType === "poll" && a.pollOption) return { verb: "chose", label: a.pollOption, isNotFamiliar: false };
    if (questionType === "rating" && a.rating != null) return { verb: "rated", label: `${a.rating} / 5 ★`, isNotFamiliar: false };
    if (a.answerText) return { verb: "answered", label: a.answerText, isNotFamiliar: false };
    return { verb: "answered", label: "—", isNotFamiliar: false };
  };

  if (loading) {
    return (
      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm mb-5 space-y-4 animate-pulse">
        <div className="h-5 bg-muted rounded w-36" />
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-muted rounded w-48" />
            <div className="h-10 bg-muted rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (answers.length === 0) return null;

  const canFlag = questionType === "short_answer" && !!user;

  return (
    <>
      <AnimatePresence>
        {flagModalId !== null && (
          <FlagModal
            answerId={flagModalId}
            onClose={() => setFlagModalId(null)}
            onFlagged={() => setFlaggedIds(prev => new Set([...prev, flagModalId!]))}
          />
        )}
      </AnimatePresence>

      <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm mb-5">
        <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          What people said
          <span className="ml-auto text-xs font-normal text-muted-foreground">{answers.length} answer{answers.length !== 1 ? "s" : ""}</span>
        </h3>
        <div className="space-y-4">
          {answers.map(a => {
            const { verb, label, isNotFamiliar } = getAnswerDisplay(a);
            return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-4 ${a.isOwn ? "bg-amber-50 border-amber-200" : "bg-muted/40 border-border"}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${a.isOwn ? "bg-amber-200 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                  {a.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className={`font-semibold ${a.isOwn ? "text-amber-700" : ""}`}>{a.displayName}</span>
                    <span className="text-muted-foreground"> {verb}: </span>
                    <span className={`font-medium ${isNotFamiliar ? "text-gray-500 italic" : questionType === "rating" ? "text-amber-600" : ""}`}>{label}</span>
                    {a.isOwn && (
                      <span className="ml-2 text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">you</span>
                    )}
                  </p>
                  {a.reason && a.reason.trim() !== "" && (
                    <div className="mt-2.5 pl-3 border-l-2 border-amber-300 bg-amber-50/50 rounded-r-lg py-1.5 pr-2">
                      <p className="text-sm text-foreground/80 italic">
                        <span className="not-italic mr-1">💬</span>
                        &ldquo;{a.reason.trim()}&rdquo;
                      </p>
                    </div>
                  )}
                  {/* Flag button — subtle, only for signed-in users on non-own short answers */}
                  {canFlag && !a.isOwn && (
                    <div className="mt-2 flex justify-end">
                      {flaggedIds.has(a.id) ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="hsl(0 84% 60%)" stroke="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" stroke="hsl(0 84% 60%)" strokeWidth="2"/></svg>
                          Flagged
                        </span>
                      ) : (
                        <button
                          onClick={() => setFlagModalId(a.id)}
                          className="text-xs text-muted-foreground/60 hover:text-red-500 flex items-center gap-1 transition-colors"
                          title="Flag this answer"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                          Flag
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
          })}
        </div>
      </div>
    </>
  );
}

// ── Share Buttons ────────────────────────────────────────────────────────────

function ShareButtons({ questionTitle, questionUrl, isCreator }: { questionTitle: string; questionUrl: string; isCreator: boolean }) {
  const [copied, setCopied] = useState(false);
  const shareText = encodeURIComponent(`I found this interesting question 👇 Give your opinion!\n${questionUrl}`);

  const handleCopy = () => {
    navigator.clipboard.writeText(questionUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm mb-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="font-semibold text-sm text-foreground">
            {isCreator ? "Share your question to get more answers and earn bonuses" : "Share this question"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* WhatsApp */}
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/>
            </svg>
            WhatsApp
          </a>
          {/* Facebook */}
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(questionUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Facebook
          </a>
          {/* Twitter / X */}
          <a
            href={`https://twitter.com/intent/tweet?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Twitter / X
          </a>
          {/* Copy Link */}
          <button
            onClick={handleCopy}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
              copied
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-muted border-border text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {copied ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copy Link
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bonus Progress Box (creator only) ────────────────────────────────────────

interface BonusProgress {
  uniqueAnswerers: number;
  nextMilestone: number | null;
  nextRewardCents: number | null;
  needed: number | null;
  progressPercent: number;
  rewardedMilestones: number[];
  totalRewardedCents: number;
}

function BonusProgressBox({ questionId, refreshKey }: { questionId: number; refreshKey: number }) {
  const [data, setData] = useState<BonusProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/questions/${questionId}/bonus-progress`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [questionId, refreshKey]);

  if (loading) return null;
  if (!data) return null;

  const allComplete = data.nextMilestone === null;

  const rewardLabel = (!allComplete && data.nextRewardCents != null)
    ? (data.nextRewardCents >= 100 ? `$${(data.nextRewardCents / 100).toFixed(2)}` : `${data.nextRewardCents}¢`)
    : null;
  const totalLabel = data.totalRewardedCents >= 100
    ? `$${(data.totalRewardedCents / 100).toFixed(2)}`
    : `${data.totalRewardedCents}¢`;

  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl p-5 shadow-sm mb-5">
      <div className="flex items-center gap-2 mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 46%)" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span className="font-bold text-amber-800 text-sm">Your Bonus Progress</span>
        {data.totalRewardedCents > 0 && (
          <span className="ml-auto text-xs text-amber-600 font-medium bg-amber-100 px-2 py-0.5 rounded-full">
            {totalLabel} earned so far
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-amber-700 mb-1.5 font-medium">
          <span>{data.uniqueAnswerers} {allComplete ? "answers" : `/ ${data.nextMilestone} answers`}</span>
          <span>{data.progressPercent}%</span>
        </div>
        <div className="h-3 rounded-full bg-amber-100 overflow-hidden border border-amber-200">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${data.progressPercent}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400"
          />
        </div>
      </div>

      {allComplete ? (
        <div className="text-sm text-amber-800 font-medium">
          🎉 Bonus completed! You've earned all available rewards.
        </div>
      ) : (
        <div className="text-sm text-amber-800">
          <span className="font-semibold">Next reward: {rewardLabel}</span>
          <span className="text-amber-600"> at {data.nextMilestone} answers</span>
          <span className="mx-2 text-amber-300">•</span>
          <span className="text-amber-700">You need <strong>{data.needed}</strong> more {data.needed === 1 ? "answer" : "answers"}</span>
        </div>
      )}

      {data.rewardedMilestones.length > 0 && (
        <div className="mt-3 pt-3 border-t border-amber-200 flex flex-wrap gap-1.5">
          <span className="text-xs text-amber-600 font-medium">Milestones reached:</span>
          {data.rewardedMilestones.sort((a, b) => a - b).map(m => (
            <span key={m} className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
              ✓ {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page component ──────────────────────────────────────────────────────

export default function QuestionDetail() {
  const { id } = useParams<{ id: string }>();
  const questionId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const { user } = useUser();

  const { data: question, isLoading, isError } = useGetQuestion(questionId);
  const submitAnswer = useSubmitAnswer();

  useEffect(() => {
    if (question?.title) {
      document.title = `${question.title} – Opinoza`;
      const desc = question.description
        ? question.description.substring(0, 200)
        : `Share your opinion on "${question.title}" and earn 1¢ on Opinoza.`;
      let metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.name = "description";
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = desc;
      let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement("link");
        canonical.rel = "canonical";
        document.head.appendChild(canonical);
      }
      canonical.href = `https://opinoza.com/question/${questionId}`;
    }
    return () => {
      document.title = "Opinoza";
      const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (metaDesc) metaDesc.content = "Share your opinions and earn real money on Opinoza. Answer polls, ratings, and questions to earn 1¢ per answer. Join thousands of users today.";
      const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (canonical) canonical.href = "https://opinoza.com";
    };
  }, [question?.title, question?.description, questionId]);

  const [answerText, setAnswerText] = useState("");
  const [pollOption, setPollOption] = useState("");
  const [rating, setRating] = useState(0);
  const [notFamiliar, setNotFamiliar] = useState(false);
  const [reason, setReason] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [earnedCents, setEarnedCents] = useState(0);
  const [localSubmitted, setLocalSubmitted] = useState(false);
  const [bonusRefreshKey, setBonusRefreshKey] = useState(0);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Flag restriction state (applies to ALL question types)
  const [hasPendingFlag, setHasPendingFlag] = useState(false);
  const [flaggedAnswers, setFlaggedAnswers] = useState<{ id: number; questionId: number; questionTitle: string | null; answerText: string | null }[]>([]);

  useEffect(() => {
    if (!user) return;
    const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${base}/api/answers/my-flag-status`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { hasPendingFlag: false, flaggedAnswers: [] })
      .then(d => {
        setHasPendingFlag(d.hasPendingFlag ?? false);
        setFlaggedAnswers(d.flaggedAnswers ?? []);
      })
      .catch(() => {});
  }, [user?.id, question?.type, localSubmitted, submitAnswer.isError]);

  // Pre-fill form when entering edit mode
  useEffect(() => {
    if (isEditing && question?.userAnswer) {
      setAnswerText(question.userAnswer.answerText || "");
      setPollOption(question.userAnswer.pollOption || "");
      setRating(question.userAnswer.rating || 0);
      setNotFamiliar((question.userAnswer as any).notFamiliar || false);
      setReason(question.userAnswer.reason || "");
      setUpdateError(null);
      setUpdateSuccess(false);
    }
  }, [isEditing, question?.userAnswer]);

  if (isNaN(questionId) || questionId <= 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center text-muted-foreground">
        <p className="font-medium text-lg">Invalid question</p>
        <Link href="/questions"><button className="mt-4 text-amber-600 hover:underline text-sm">← Back to questions</button></Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="h-4 bg-muted rounded w-48 mb-6 animate-pulse" />
        <div className="bg-card border border-card-border rounded-2xl p-8 animate-pulse space-y-4">
          <div className="flex gap-2">
            <div className="h-6 bg-muted rounded-full w-24" />
            <div className="h-6 bg-muted rounded-full w-20" />
          </div>
          <div className="h-7 bg-muted rounded w-3/4" />
          <div className="h-5 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-1/4" />
        </div>
        <div className="mt-4 bg-card border border-card-border rounded-2xl p-8 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-6" />
          <div className="h-24 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !question) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-muted-foreground opacity-40">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
        </svg>
        <p className="font-semibold text-foreground text-lg">Question not found</p>
        <p className="text-muted-foreground text-sm mt-1">This question may have been removed or the link is incorrect.</p>
        <Link href="/questions"><button className="mt-6 px-5 py-2.5 rounded-xl gold-gradient text-white font-semibold text-sm hover:opacity-90">Browse Questions</button></Link>
      </div>
    );
  }

  const userHasAnswered = question.userHasAnswered || localSubmitted;
  const rewardCents = (question as any).isProfileQuestion ? 2 : 1;

  const canSubmit = !submitAnswer.isPending && (
    (question.type === "short_answer" && answerText.trim().length > 0 && answerText.trim().length <= SHORT_ANSWER_MAX) ||
    (question.type === "poll" && pollOption !== "") ||
    (question.type === "rating" && (rating > 0 || notFamiliar))
  );

  const canUpdate = !isUpdating && (
    (question.type === "short_answer" && answerText.trim().length > 0 && answerText.trim().length <= SHORT_ANSWER_MAX) ||
    (question.type === "poll" && pollOption !== "") ||
    (question.type === "rating" && (rating > 0 || notFamiliar))
  );

  const handleSubmit = () => {
    if (!canSubmit) return;
    submitAnswer.mutate({
      data: {
        questionId,
        answerText: question.type === "short_answer" ? answerText.trim() : null,
        pollOption: question.type === "poll" ? pollOption : null,
        rating: question.type === "rating" && !notFamiliar ? rating : null,
        ...(question.type === "rating" ? { notFamiliar } : {}),
        reason: reason.trim() || null,
      } as any,
    }, {
      onSuccess: (result) => {
        setEarnedCents(result.earnedCents);
        setLocalSubmitted(true);
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2800);
        queryClient.invalidateQueries({ queryKey: getGetQuestionQueryKey(questionId) });
        queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyAnswersQueryKey() });
        // Signal header wallet badge to play sound + animate
        window.dispatchEvent(new CustomEvent("coin-earned", { detail: { cents: result.earnedCents } }));
        // Refresh bonus progress for the creator
        setBonusRefreshKey(k => k + 1);
      },
    });
  };

  const handleUpdate = async () => {
    if (!canUpdate || !question.userAnswer) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/answers/${question.userAnswer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answerText: question.type === "short_answer" ? answerText.trim() : undefined,
          pollOption: question.type === "poll" ? pollOption : undefined,
          rating: question.type === "rating" && !notFamiliar ? rating : undefined,
          notFamiliar: question.type === "rating" ? notFamiliar : undefined,
          reason: reason.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setUpdateError(data.error || "Update failed");
        return;
      }
      setUpdateSuccess(true);
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: getGetQuestionQueryKey(questionId) });
      queryClient.invalidateQueries({ queryKey: getGetMyAnswersQueryKey() });
    } catch {
      setUpdateError("Network error — please try again");
    } finally {
      setIsUpdating(false);
    }
  };

  const answerForm = (isEdit: boolean) => (
    <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 shadow-sm mb-5">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-bold text-xl text-foreground">
          {isEdit ? "Edit Your Answer" : "Your Answer"}
        </h2>
        {!isEdit && (
          <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
            </svg>
            Earn {rewardCents}¢
          </div>
        )}
        {isEdit && (
          <button
            onClick={() => setIsEditing(false)}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Short Answer */}
      {question.type === "short_answer" && (
        <div>
          {/* Full-name payment note */}
          {question.title?.toLowerCase().includes("full name") && (
            <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 leading-relaxed">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5 text-amber-500">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
              </svg>
              Please enter your real full name with correct spelling. This is important because your payments will be made using this name.
            </div>
          )}
          <AnswerSuggestInput
            questionId={questionId}
            value={answerText}
            onChange={setAnswerText}
            maxLength={SHORT_ANSWER_MAX}
          />
          <div className={`text-xs text-right mt-1 font-medium ${answerText.length > SHORT_ANSWER_MAX - 10 ? "text-amber-600" : "text-muted-foreground"}`}>
            {answerText.length}/{SHORT_ANSWER_MAX}
          </div>
        </div>
      )}

      {/* Poll */}
      {question.type === "poll" && question.pollOptions && (
        <div className="space-y-2.5">
          {question.pollOptions.map(opt => (
            <label
              key={opt}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                pollOption === opt
                  ? "border-amber-400 bg-amber-50 shadow-sm"
                  : "border-border hover:border-amber-200 hover:bg-muted/50"
              }`}
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                pollOption === opt ? "border-amber-400 bg-amber-400" : "border-muted-foreground"
              }`}>
                {pollOption === opt && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <input
                type="radio"
                name="poll"
                value={opt}
                checked={pollOption === opt}
                onChange={() => setPollOption(opt)}
                className="sr-only"
              />
              <span className="font-medium text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      )}

      {/* Rating */}
      {question.type === "rating" && (
        <div className="flex flex-col items-center py-4 gap-3">
          <p className="text-sm text-muted-foreground">Select your rating</p>
          <StarRating
            value={notFamiliar ? 0 : rating}
            onChange={(v) => { setRating(v); setNotFamiliar(false); }}
          />
          {rating === 0 && !notFamiliar && (
            <p className="text-xs text-muted-foreground">Click a star to rate</p>
          )}
          <div className="w-full border-t border-border pt-3 mt-1">
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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="shrink-0 text-gray-600"><path d="M20 6L9 17l-5-5"/></svg>
              )}
              I'm not familiar with this
            </button>
            {!notFamiliar && (
              <p className="text-xs text-muted-foreground text-center mt-1.5">
                If you don't know about this, click here — you'll still earn 1¢.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Reason (optional) */}
      <div className="mt-5">
        <label className="block text-sm font-medium text-muted-foreground mb-2">
          Reason <span className="text-xs">(optional — add context to your answer)</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Why did you choose this answer?"
          rows={2}
          maxLength={REASON_MAX}
          className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
        />
        <div className={`text-xs text-right mt-1 font-medium ${reason.length > REASON_MAX - 20 ? "text-amber-600" : "text-muted-foreground"}`}>
          {reason.length}/{REASON_MAX}
        </div>
      </div>

      {/* Errors */}
      {!isEdit && submitAnswer.isError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {(submitAnswer.error as any)?.data?.code === "flagged_answer_restriction" ? (
            <div>
              <p className="mb-2">{(submitAnswer.error as any)?.data?.error}</p>
              {flaggedAnswers.length > 0 && (
                flaggedAnswers[0].questionId === questionId ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors"
                  >
                    Edit flagged answer
                  </button>
                ) : (
                  flaggedAnswers.map(fa => (
                    <Link key={fa.id} href={`/questions/${fa.questionId}`}>
                      <button className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors">
                        Review flagged answer
                      </button>
                    </Link>
                  ))
                )
              )}
            </div>
          ) : (
            (submitAnswer.error as any)?.data?.error || "Something went wrong. Please try again."
          )}
        </div>
      )}
      {isEdit && updateError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {updateError}
        </div>
      )}

      {/* Submit / Update */}
      <button
        onClick={isEdit ? handleUpdate : handleSubmit}
        disabled={isEdit ? !canUpdate : !canSubmit}
        className="mt-5 w-full py-4 rounded-xl font-semibold text-lg gold-gradient text-white shadow-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
      >
        {(isEdit ? isUpdating : submitAnswer.isPending) ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            {isEdit ? "Updating..." : "Submitting..."}
          </span>
        ) : isEdit ? "Update Answer" : `Submit Answer & Earn ${rewardCents}¢`}
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <AnimatePresence>
        {showCelebration && <EarningCelebration cents={earnedCents} />}
      </AnimatePresence>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/questions">
          <span className="hover:text-amber-600 cursor-pointer transition-colors flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Questions
          </span>
        </Link>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        <span className="text-foreground font-medium line-clamp-1 max-w-xs">{question.title}</span>
      </nav>

      {/* Question Header */}
      <div className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 mb-5 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            {TYPE_LABELS[question.type] || question.type}
          </span>
          {((question as any).categories ?? [question.category]).map((cat: string) => (
            <span key={cat} className="text-xs text-muted-foreground px-2.5 py-1 rounded-full bg-muted">{cat}</span>
          ))}
          {question.isCustom && (
            <span className="text-xs text-blue-600 font-medium px-2.5 py-1 rounded-full bg-blue-50 border border-blue-100">
              Community
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 leading-snug">{question.title}</h1>
        {question.description && (
          <p className="text-muted-foreground leading-relaxed">{question.description}</p>
        )}

        <div className="flex items-center flex-wrap gap-4 mt-5 pt-5 border-t border-border text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {question.totalAnswers} answer{question.totalAnswers !== 1 ? "s" : ""}
          </span>
          {question.creatorName && (
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              By {question.creatorName}
            </span>
          )}
        </div>
      </div>

      {/* Share buttons — visible to all users */}
      {(() => {
        const questionUrl = `https://opinoza.com/questions/${questionId}`;
        const isCreator = !!user && question.creatorId === user.id;
        return (
          <>
            <ShareButtons
              questionTitle={question.title}
              questionUrl={questionUrl}
              isCreator={isCreator}
            />
            {isCreator && (
              <BonusProgressBox questionId={questionId} refreshKey={bonusRefreshKey} />
            )}
          </>
        );
      })()}

      {/* Already Answered → show result banner + edit option */}
      {userHasAnswered && !isEditing ? (
        <div className="mb-5">
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(142 76% 36%)" strokeWidth="2.5">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-green-800">You answered this question</p>
                  {localSubmitted && <p className="text-sm text-green-600 mt-0.5">+{earnedCents}¢ added to your wallet</p>}
                  {updateSuccess && <p className="text-sm text-green-600 mt-0.5">Answer updated</p>}
                  {/* Show current answer summary */}
                  {question.userAnswer && !localSubmitted && (
                    <p className="text-sm text-green-700 mt-0.5">
                      {question.userAnswer.pollOption && <span>Voted: <strong>{question.userAnswer.pollOption}</strong></span>}
                      {(question.userAnswer as any).notFamiliar && <span><em className="text-gray-600 not-italic">Not familiar with this</em></span>}
                      {!((question.userAnswer as any).notFamiliar) && question.userAnswer.rating && <span>Rated: <strong>{question.userAnswer.rating}/5</strong></span>}
                      {question.userAnswer.answerText && <span>Your answer: <strong>"{question.userAnswer.answerText}"</strong></span>}
                    </p>
                  )}
                </div>
              </div>
              {/* Edit button — only if user is signed in and answer exists */}
              {user && question.userAnswer && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="shrink-0 px-4 py-2 rounded-xl border border-green-300 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors flex items-center gap-1.5"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit
                </button>
              )}
            </div>
            {/* Full-name payment note — answered/read-only state */}
            {question.title?.toLowerCase().includes("full name") && (
              <div className="mt-4 pt-4 border-t border-amber-200 flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5 text-xs text-amber-800 leading-relaxed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5 text-amber-500">
                  <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
                </svg>
                This name should be correct because your payments will be made using this name. Use the Edit button above to update it if needed.
              </div>
            )}
          </div>
        </div>
      ) : isEditing ? (
        answerForm(true)
      ) : (
        /* Answer Form — new submission */
        <Show
          when="signed-in"
          fallback={
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center mb-5">
              <div className="w-14 h-14 rounded-xl gold-gradient flex items-center justify-center mx-auto mb-4 shadow-md">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
                </svg>
              </div>
              <h3 className="font-bold text-xl text-foreground mb-2">Sign in to Answer & Earn</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Answer this question to earn <strong className="text-amber-600">1 cent</strong> credited to your wallet
              </p>
              <div className="flex gap-3 justify-center">
                <Link href="/sign-in">
                  <button className="px-6 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Sign in</button>
                </Link>
                <Link href="/sign-up">
                  <button className="px-6 py-2.5 rounded-xl gold-gradient text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm">
                    Create Free Account
                  </button>
                </Link>
              </div>
            </div>
          }
        >
          {hasPendingFlag ? (
            /* Flag restriction banner — shown when user has a pending flagged short answer */
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 mb-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(0 84% 60%)" strokeWidth="2.5">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-red-800 mb-1">Answer needs correction</p>
                  <p className="text-sm text-red-700 mb-4">
                    One or more of your short answers has been flagged and needs correction before you can submit more short answers. Please review and edit it.
                  </p>
                  {flaggedAnswers.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {flaggedAnswers.map(fa => (
                        <div key={fa.id} className="bg-white border border-red-200 rounded-xl p-3">
                          <p className="text-xs text-red-600 font-semibold mb-0.5 truncate">{fa.questionTitle || "Question"}</p>
                          <p className="text-sm text-foreground truncate">&ldquo;{fa.answerText}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-3 flex-wrap">
                    {flaggedAnswers.length > 0 && flaggedAnswers[0].questionId === questionId ? (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                      >
                        Edit now
                      </button>
                    ) : (
                      flaggedAnswers.map(fa => (
                        <Link key={fa.id} href={`/questions/${fa.questionId}`}>
                          <button className="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors">
                            Review flagged answer
                          </button>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : answerForm(false)}
        </Show>
      )}

      {/* Rating Results */}
      {question.type === "rating" && question.totalAnswers > 0 && (
        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm mb-5">
          <h3 className="font-bold text-lg mb-5">Rating Results</h3>
          {question.ratingAverage != null && (question as any).ratingCount > 0 ? (
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <div className="text-5xl font-bold text-amber-500">{question.ratingAverage.toFixed(1)}</div>
                <div className="text-xs text-muted-foreground mt-1">Average rating</div>
              </div>
              <div>
                <StarRating value={Math.round(question.ratingAverage)} readonly />
                <p className="text-sm text-muted-foreground mt-2">
                  Based on {(question as any).ratingCount} rating{(question as any).ratingCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">No ratings yet.</p>
          )}
          {(question as any).notFamiliarCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-60"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              <span>{(question as any).notFamiliarCount} user{(question as any).notFamiliarCount !== 1 ? "s" : ""} said they are not familiar with this</span>
            </div>
          )}
        </div>
      )}

      {/* Poll Results — shown after answering */}
      {question.type === "poll" && question.pollResults && question.pollResults.length > 0 && userHasAnswered && (
        <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm mb-5">
          <h3 className="font-bold text-lg mb-5">Poll Results</h3>
          <div className="space-y-4">
            {question.pollResults.map(result => (
              <div key={result.option}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className={`font-medium ${result.option === (question.userAnswer?.pollOption || pollOption) ? "text-amber-700" : "text-foreground"}`}>
                    {result.option}
                    {result.option === (question.userAnswer?.pollOption || pollOption) && (
                      <span className="ml-1.5 text-xs text-amber-500">(your vote)</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{result.percentage}% ({result.count})</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${result.percentage}%` }}
                    transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                    className={`h-full rounded-full ${result.option === (question.userAnswer?.pollOption || pollOption) ? "gold-gradient" : "bg-blue-400"}`}
                  />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground mt-2">{question.totalAnswers} total votes</p>
          </div>
        </div>
      )}

      {/* Short answer results — grouped stats */}
      {question.type === "short_answer" && userHasAnswered && (
        <ShortAnswerStats
          questionId={questionId}
          userAnswerText={
            question.userAnswer?.answerText ?? (localSubmitted ? answerText : null)
          }
          totalAnswers={question.totalAnswers}
        />
      )}

      {/* Individual answers feed — visible to all users */}
      {question.totalAnswers > 0 && (
        <AnswersFeed
          questionId={questionId}
          questionType={question.type}
          refreshKey={bonusRefreshKey}
        />
      )}
    </div>
  );
}
