import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useGetWallet, getGetWalletQueryKey, useCreateQuestion, useGetMe, VALID_CATEGORIES } from "@workspace/api-client-react";
import { useMyQuestions } from "@/hooks/useMyQuestions";

const QUESTION_COST_CENTS = 25;

const STATUS_CONFIG = {
  pending: { label: "Under Review", color: "bg-amber-100 text-amber-700 border-amber-200", icon: "⏳" },
  active: { label: "Live", color: "bg-green-100 text-green-700 border-green-200", icon: "✅" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: "❌" },
};

const TYPE_LABELS: Record<string, string> = { short_answer: "Short Answer", poll: "Poll", rating: "Rating" };

export default function Ask() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: wallet } = useGetWallet();
  const createQuestion = useCreateQuestion();
  const { data: myQuestionsData, isLoading: questionsLoading } = useMyQuestions();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"short_answer" | "poll" | "rating">("short_answer");
  const [categories, setCategories] = useState<string[]>([]);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [showForm, setShowForm] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<string | null>(null);

  const { data: me } = useGetMe();
  const isAdmin = !!me?.isAdmin;

  // ── Cooldown timer ──────────────────────────────────────────────────────────
  const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
  const [localCooldownStart, setLocalCooldownStart] = useState<Date | null>(null);
  const [cooldownSecsLeft, setCooldownSecsLeft] = useState(0);

  useEffect(() => {
    const serverTs = me?.lastQuestionAt ? new Date((me as any).lastQuestionAt) : null;
    const effective = (() => {
      if (!serverTs && !localCooldownStart) return null;
      if (!serverTs) return localCooldownStart!;
      if (!localCooldownStart) return serverTs;
      return serverTs > localCooldownStart ? serverTs : localCooldownStart;
    })();

    const cooldownEnd = effective ? new Date(effective.getTime() + COOLDOWN_MS) : null;

    const compute = () => {
      if (isAdmin || !cooldownEnd) { setCooldownSecsLeft(0); return; }
      const remaining = Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000);
      setCooldownSecsLeft(Math.max(0, remaining));
    };
    compute();
    if (!cooldownEnd || isAdmin) return;
    const interval = setInterval(compute, 1000);
    return () => clearInterval(interval);
  }, [me, localCooldownStart, isAdmin]);

  const isOnCooldown = !isAdmin && cooldownSecsLeft > 0;
  const cooldownMins = Math.floor(cooldownSecsLeft / 60).toString().padStart(2, "0");
  const cooldownSecs = (cooldownSecsLeft % 60).toString().padStart(2, "0");

  const balance = wallet?.balanceCents ?? 0;
  const canAfford = balance >= QUESTION_COST_CENTS;

  const myQuestions = myQuestionsData?.questions ?? [];

  const addPollOption = () => setPollOptions(prev => [...prev, ""]);
  const removePollOption = (i: number) => setPollOptions(prev => prev.filter((_, idx) => idx !== i));
  const updatePollOption = (i: number, val: string) => {
    setPollOptions(prev => { const u = [...prev]; u[i] = val; return u; });
  };

  const isValid = title.trim().length >= 10 && categories.length > 0 &&
    (type !== "poll" || pollOptions.filter(o => o.trim()).length >= 2);

  const handleSubmit = () => {
    if (!isValid || !canAfford) return;
    createQuestion.mutate({
      data: {
        title: title.trim(),
        description: description.trim() || null,
        type,
        categories,
        pollOptions: type === "poll" ? pollOptions.filter(o => o.trim()) : null,
      },
    }, {
      onSuccess: (q) => {
        queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
        queryClient.invalidateQueries({ queryKey: ["my-questions"] });
        setLocalCooldownStart(new Date());
        setJustSubmitted(q.title);
        setTitle(""); setDescription(""); setType("short_answer"); setCategories([]); setPollOptions(["", ""]);
        setShowForm(false);
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Ask a Question</h1>
        <p className="text-muted-foreground mt-1.5">Submit a custom question and earn <span className="font-semibold text-amber-600">0.5¢</span> every time someone answers it</p>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {justSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(142 76% 36%)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <div>
              <p className="font-semibold text-green-800">
                {isAdmin ? "Question published!" : "Question submitted for review!"}
              </p>
              <p className="text-sm text-green-600">
                {isAdmin
                  ? `"${justSubmitted}" — live now. You'll earn 0.5¢ per answer.`
                  : `"${justSubmitted}" — you'll earn 0.5¢ per answer once approved.`}
              </p>
            </div>
            <button onClick={() => setJustSubmitted(null)} className="ml-auto text-green-400 hover:text-green-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cost info — applies to all users including admins */}
      <div className={`rounded-xl p-4 mb-6 flex items-center justify-between gap-4 ${canAfford ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
        <div>
          <p className={`font-semibold ${canAfford ? "text-amber-700" : "text-red-700"}`}>
            Cost: 25 cents (25¢)
          </p>
          <p className={`text-sm mt-0.5 ${canAfford ? "text-amber-600" : "text-red-600"}`}>
            {canAfford
              ? `Your balance: ${balance}¢ — You can afford this`
              : `Your balance: ${balance}¢ — Need ${QUESTION_COST_CENTS - balance}¢ more to submit.`
            }
          </p>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${canAfford ? "gold-gradient" : "bg-red-100"}`}>
          {canAfford
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-white"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="hsl(0 84% 60%)" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          }
        </div>
      </div>

      {/* Toggle form */}
      {!showForm ? (
        <div>
          <button
            onClick={() => { if (!isOnCooldown && canAfford) setShowForm(true); }}
            disabled={!canAfford || isOnCooldown}
            className="w-full py-4 rounded-xl gold-gradient text-white font-semibold text-lg shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isOnCooldown
              ? `Next question in ${cooldownMins}:${cooldownSecs}`
              : canAfford
                ? "Create a New Question"
                : `Need ${QUESTION_COST_CENTS - balance}¢ more to create a question`}
          </button>
          <p className="text-center text-xs text-red-500 font-medium mt-2">⚠️ Ask for opinions, not facts.</p>
        </div>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-card-border rounded-2xl p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-foreground">New Question</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Question Title * <span className="text-muted-foreground font-normal">(min 10 chars)</span>
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What would you like to ask the community?"
                maxLength={200}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <div className="text-xs text-muted-foreground mt-1 text-right">{title.length}/200</div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add context to help people understand your question..."
                rows={2}
                maxLength={500}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
              />
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-foreground">
                  Categories * <span className="font-normal text-muted-foreground">(select 1–3)</span>
                </label>
                {categories.length > 0 && (
                  <span className={`text-xs font-medium ${categories.length === 3 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {categories.length}/3 selected
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VALID_CATEGORIES.filter(c => c !== "Personal Profile").map(c => {
                  const checked = categories.includes(c);
                  const maxed = !checked && categories.length >= 3;
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={maxed}
                      onClick={() => {
                        if (maxed) return;
                        setCategories(prev =>
                          prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                        );
                      }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-xs font-medium transition-all ${
                        checked
                          ? "border-amber-400 bg-amber-50 text-amber-800"
                          : maxed
                            ? "border-border bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                            : "border-border hover:border-amber-300 hover:bg-amber-50/50 text-foreground"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                        checked ? "bg-amber-400 border-amber-400" : "border-muted-foreground/40"
                      }`}>
                        {checked && (
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Question Type */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-3">Question Type *</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: "short_answer", emoji: "✍️", label: "Short Answer", desc: "1–3 word reply" },
                  { key: "poll", emoji: "📊", label: "Poll", desc: "Multiple choice" },
                  { key: "rating", emoji: "⭐", label: "Rating", desc: "1–5 star scale" },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setType(t.key)}
                    className={`p-4 rounded-xl border-2 text-center transition-all ${type === t.key ? "border-amber-400 bg-amber-50" : "border-border hover:border-amber-200"}`}
                  >
                    <div className="text-2xl mb-1">{t.emoji}</div>
                    <div className="text-xs font-semibold text-foreground">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Poll Options */}
            {type === "poll" && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-3">Poll Options (at least 2) *</label>
                <div className="space-y-2">
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        value={opt}
                        onChange={e => updatePollOption(i, e.target.value)}
                        placeholder={`Option ${i + 1}`}
                        maxLength={100}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removePollOption(i)}
                          className="px-3 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 8 && (
                    <button type="button" onClick={addPollOption} className="text-sm text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mt-1 transition-colors">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                      Add option
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Submit */}
            <div>
              {!isValid && title.length > 0 && (
                <p className="text-xs text-muted-foreground mb-3">
                  {title.trim().length < 10 ? "Title must be at least 10 characters. " : ""}
                  {categories.length === 0 ? "Please select a category. " : ""}
                  {type === "poll" && pollOptions.filter(o => o.trim()).length < 2 ? "Add at least 2 poll options." : ""}
                </p>
              )}
              {isOnCooldown && (
                <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(38 92% 50%)" strokeWidth="2.5" className="shrink-0">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <p className="text-sm text-amber-700 font-medium">
                    You can create your next question in <span className="font-bold tabular-nums">{cooldownMins}:{cooldownSecs}</span>
                  </p>
                </div>
              )}
              <button
                onClick={handleSubmit}
                disabled={!isValid || !canAfford || createQuestion.isPending || isOnCooldown}
                className="w-full py-4 rounded-xl gold-gradient text-white font-semibold text-lg shadow-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {createQuestion.isPending
                  ? "Submitting..."
                  : isOnCooldown
                    ? `Wait ${cooldownMins}:${cooldownSecs} before submitting again`
                    : isAdmin
                      ? `Publish Question (${QUESTION_COST_CENTS}¢ charged · Goes Live Immediately)`
                      : `Submit for Review (${QUESTION_COST_CENTS}¢ charged)`}
              </button>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {isAdmin
                  ? `25¢ is deducted from your wallet. As admin, questions are published instantly.`
                  : `Reviewed within 24–48 hours. If rejected, 20¢ is refunded (5¢ penalty retained). You earn 0.5¢ per answer once live.`}
              </p>
              {createQuestion.isError && (
                <p className="text-sm text-destructive text-center mt-2">
                  {(createQuestion.error as any)?.data?.error || "Failed to submit question"}
                </p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* My Questions — shown below the create section */}
      {myQuestions.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-foreground mb-3">My Submitted Questions</h2>
          <div className="space-y-3">
            {myQuestions.map(q => {
              const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.pending;
              return (
                <div key={q.id} className="bg-card border border-card-border rounded-xl px-5 py-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{TYPE_LABELS[q.type]}</span>
                      {((q as any).categories ?? [q.category]).map((cat: string) => (
                        <span key={cat} className="text-xs text-muted-foreground">· {cat}</span>
                      ))}
                    </div>
                    <p className="font-medium text-foreground text-sm line-clamp-2">{q.title}</p>
                    {q.status === "active" && (
                      <p className="text-xs text-amber-600 mt-1">{q.totalAnswers} answers · {q.totalAnswers} × 0.5¢ earned so far</p>
                    )}
                    {q.status === "rejected" && (
                      <p className="text-xs text-muted-foreground mt-1">20¢ refunded · 5¢ penalty retained</p>
                    )}
                    {q.status === "pending" && (
                      <p className="text-xs text-muted-foreground mt-1">Submitted {new Date(q.createdAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  {q.status === "active" && (
                    <Link href={`/questions/${q.id}`}>
                      <button className="text-xs text-amber-600 hover:underline shrink-0">View →</button>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="mt-10 bg-muted/50 rounded-2xl p-6">
        <h3 className="font-bold text-foreground mb-4">How Custom Questions Work</h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-3">
            <span className="font-bold text-amber-600">1.</span>
            <span>You pay {QUESTION_COST_CENTS}¢ to submit a question for admin review</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-amber-600">2.</span>
            <span>Admins review within 24–48h — spam and duplicates are rejected</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-amber-600">3.</span>
            <span>If approved, your question goes live and the 25¢ fee is kept. If rejected, 20¢ is refunded and 5¢ is kept as a penalty.</span>
          </div>
          <div className="flex gap-3">
            <span className="font-bold text-amber-600">4.</span>
            <span>You earn 0.5¢ creator bonus for every answer your question receives</span>
          </div>
        </div>
      </div>
    </div>
  );
}
