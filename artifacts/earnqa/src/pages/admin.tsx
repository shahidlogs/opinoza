import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import {
  useGetMe,
  useGetAdminStats,
  useGetAdminGrowth,
  useGetAdminEarningsAnalytics,
  useApproveQuestion,
  useRejectQuestion,
  useApproveWithdrawal,
  useRejectWithdrawalAdmin,
  useTransferWithdrawal,
  useGetAdminReferralStats,
  usePatchAdminReferralStatus,
  useReverseAdminReferral,
  VALID_CATEGORIES,
} from "@workspace/api-client-react";

type AdminTab = "questions" | "all-questions" | "users" | "withdrawals" | "stats" | "referrals" | "flags" | "verifications";

const REJECTION_REASONS = [
  "Not an opinion, preference, habit, or behavior-based question",
  "Not a short-answer question",
  "Unclear or confusing meaning",
  "Grammar or spelling mistakes",
  "Missing or weak description",
  "Duplicate or very similar question",
  "Not suitable for our platform",
] as const;

function RejectQuestionModal({ reason, onReasonChange, onConfirm, onClose, isPending }: {
  reason: string;
  onReasonChange: (r: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-md shadow-xl"
      >
        <h2 className="text-base font-bold text-foreground mb-1">Reject Question</h2>
        <p className="text-xs text-muted-foreground mb-4">Select the reason for rejection:</p>
        <div className="space-y-2 mb-6">
          {REJECTION_REASONS.map(r => (
            <label key={r} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reason === r ? "border-red-400 bg-red-50" : "border-card-border hover:bg-muted/50"}`}>
              <input
                type="radio"
                name="rejection-reason"
                value={r}
                checked={reason === r}
                onChange={() => onReasonChange(r)}
                className="mt-0.5 accent-red-600 shrink-0"
              />
              <span className="text-sm text-foreground leading-snug">{r}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason || isPending}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40"
          >
            {isPending ? "Rejecting…" : "Confirm Reject"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditQuestionModal({ question, onClose, onSaved }: {
  question: any;
  onClose: () => void;
  onSaved: (updated: { id: number; title: string; description: string | null; type: string; status: string; categories: string[]; pollOptions: string[] | null; isProfileQuestion: boolean }) => void;
}) {
  const { getToken } = useAuth();
  const [title, setTitle] = useState(question.title);
  const [description, setDescription] = useState(question.description || "");
  const [type, setType] = useState(question.type);
  const [editCategories, setEditCategories] = useState<string[]>(question.categories ?? [question.category]);
  const [status, setStatus] = useState(question.status);
  const [pollOptions, setPollOptions] = useState<string[]>(question.pollOptions || [""]);
  const [isProfileQuestion, setIsProfileQuestion] = useState<boolean>(!!question.isProfileQuestion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateOption = (i: number, v: string) => {
    const u = [...pollOptions]; u[i] = v; setPollOptions(u);
  };

  const handleSave = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/questions/${question.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          type,
          categories: editCategories,
          status,
          pollOptions: type === "poll" ? pollOptions.filter(o => o.trim()) : null,
          isProfileQuestion,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Save failed");
        return;
      }
      const finalCategories = editCategories.length > 0 ? editCategories : [question.category].filter(Boolean);
      onSaved({
        id: question.id,
        title: title.trim(),
        description: description.trim() || null,
        type,
        status,
        categories: finalCategories,
        pollOptions: type === "poll" ? pollOptions.filter(o => o.trim()) : null,
        isProfileQuestion,
      });
      onClose();
    } catch (e) {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-lg text-foreground">Edit Question #{question.id}</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} maxLength={500}
              className="w-full px-4 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="short_answer">Short Answer</option>
                <option value="poll">Poll</option>
                <option value="rating">Rating</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400">
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="rejected">Rejected</option>
                <option value="hidden">Hidden</option>
                <option value="archived_duplicate">Archived Duplicate</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-foreground">Categories (1–3)</label>
              <span className="text-xs text-muted-foreground">{editCategories.length}/3</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {VALID_CATEGORIES.map(c => {
                const checked = editCategories.includes(c);
                const maxed = !checked && editCategories.length >= 3;
                return (
                  <button key={c} type="button" disabled={maxed}
                    onClick={() => setEditCategories(prev =>
                      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                    )}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all text-left ${
                      checked ? "border-amber-400 bg-amber-50 text-amber-800"
                        : maxed ? "border-border bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                          : "border-border hover:border-amber-300 hover:bg-amber-50/50 text-foreground"
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${checked ? "bg-amber-400 border-amber-400" : "border-muted-foreground/40"}`}>
                      {checked && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {type === "poll" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Poll Options</label>
              <div className="space-y-2">
                {pollOptions.map((opt, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={opt} onChange={e => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`}
                      className="flex-1 px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 text-sm" />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                        className="px-2.5 rounded-xl border border-border text-muted-foreground hover:bg-red-50 hover:text-red-600 text-sm">✕</button>
                    )}
                  </div>
                ))}
                {pollOptions.length < 8 && (
                  <button onClick={() => setPollOptions([...pollOptions, ""])}
                    className="text-sm text-amber-600 hover:text-amber-700 font-medium">+ Add option</button>
                )}
              </div>
            </div>
          )}

          {/* Profile Question toggle */}
          <label className="flex items-center gap-3 p-3.5 rounded-xl border border-input bg-background cursor-pointer hover:bg-muted/50 transition-colors">
            <div
              onClick={() => setIsProfileQuestion(v => !v)}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${isProfileQuestion ? "bg-amber-500" : "bg-muted"}`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isProfileQuestion ? "translate-x-5" : "translate-x-1"}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Profile Question</p>
              <p className="text-xs text-muted-foreground">Hidden from main feed · shown in profile flow · earns 2¢</p>
            </div>
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-xl gold-gradient text-white font-semibold disabled:opacity-40 hover:opacity-90 transition-all">
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button onClick={onClose}
              className="px-5 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function formatCents(cents: number): string {
  if (!cents) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

function UserProfileModal({ user, getToken, onClose }: { user: any; getToken: () => Promise<string | null>; onClose: () => void }) {
  const [earnings, setEarnings] = useState<any | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(true);

  useEffect(() => {
    setEarningsLoading(true);
    getToken().then(token =>
      fetch(`/api/admin/users/${user.clerkId}/earnings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    ).then(r => r.json())
      .then(data => { setEarnings(data); setEarningsLoading(false); })
      .catch(() => setEarningsLoading(false));
  }, [user.clerkId]);

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-card-border rounded-2xl shadow-xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">User Profile</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
        </div>

        {/* Identity */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full gold-gradient flex items-center justify-center text-white font-bold text-lg shrink-0">
            {(user.name || user.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-foreground">{user.name || "—"}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>

        {/* Basic info */}
        <div className="space-y-2.5 text-sm mb-5">
          {[
            { label: "Role", value: user.isAdmin ? "Admin" : user.isEditor ? "Editor" : user.isBanned ? "Banned" : "User" },
            { label: "Joined", value: new Date(user.createdAt).toLocaleDateString() },
            { label: "Questions Created", value: user.questionCount ?? 0 },
            { label: "Answers Given", value: user.answerCount ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{String(value)}</span>
            </div>
          ))}
        </div>

        {/* Earnings breakdown */}
        <div className="border-t border-border pt-4 mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Earnings Breakdown</div>
          {earningsLoading ? (
            <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>
          ) : earnings ? (
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Own Answer Earnings</span>
                <span className="font-medium text-foreground">{fmt(earnings.answerEarningsCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referral Signup Earnings</span>
                <span className="font-medium text-foreground">{fmt(earnings.referralSignupCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referral Answer Earnings</span>
                <span className="font-medium text-foreground">{fmt(earnings.referralAnswerCents)}</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2">
                <span className="text-muted-foreground">Total Referral Earnings</span>
                <span className="font-semibold text-emerald-600">{fmt(earnings.totalReferralCents)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="font-semibold text-foreground">Total Earned</span>
                <span className="font-bold text-amber-600">{fmt(earnings.totalEarnedCents)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Balance</span>
                <span className="font-semibold text-foreground">{fmt(earnings.currentBalanceCents)}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-2">Failed to load</div>
          )}
        </div>

        {/* Referral stats — only show if user has any referrals */}
        {earnings && earnings.invitedUsers > 0 && (
          <div className="border-t border-border pt-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Referral Activity</div>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invited Users</span>
                <span className="font-medium text-foreground">{earnings.invitedUsers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Referred Users</span>
                <span className="font-medium text-foreground">{earnings.activeReferredUsers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Referred Users' Answers</span>
                <span className="font-medium text-foreground">{earnings.referredAnswers.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function UserQuestionsModal({ user, questions, onClose }: { user: any; questions: any[]; onClose: () => void }) {
  const userQuestions = questions.filter(q => q.creatorId === user.clerkId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-card-border rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">
            Questions by {user.name || user.email}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {userQuestions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No questions created yet</p>
          ) : userQuestions.map(q => (
            <div key={q.id} className="p-3 rounded-xl border border-border bg-muted/30">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm">{q.title}</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadgeClass(q.status)}`}>
                      {q.status === "archived_duplicate" ? "archived duplicate" : q.status}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{q.type}</span>
                    <span className="text-xs text-muted-foreground">{q.totalAnswers} answers</span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(q.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function UserAnswersModal({ user, getToken, onClose }: { user: any; getToken: () => Promise<string | null>; onClose: () => void }) {
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // flag state
  const [showFlagConfirm, setShowFlagConfirm] = useState(false);
  const [flagging, setFlagging] = useState(false);
  // normalize state
  const [showNormalizeModal, setShowNormalizeModal] = useState(false);
  const [normalizeValue, setNormalizeValue] = useState("");
  const [normalizing, setNormalizing] = useState(false);
  // shared message
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    getToken().then(token =>
      fetch(`/api/admin/users/${user.clerkId}/answers`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
    )
      .then(r => r.json())
      .then(d => { setAnswers(d.answers ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user.clerkId]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedArr = Array.from(selectedIds);
  // Only short_answer type answers can be normalized
  const selectedShortAnswerIds = selectedArr.filter(id => answers.find(a => a.id === id)?.questionType === "short_answer");
  const hasAlreadyNormalized = selectedShortAnswerIds.some(id => !!answers.find(a => a.id === id)?.normalizedAnswer);

  const handleFlag = async () => {
    if (selectedArr.length === 0) return;
    setFlagging(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/answers/bulk-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ answerIds: selectedArr, flagged: true, reason: "Admin review: flagged from user answers" }),
      });
      if (res.ok) {
        setAnswers(prev => prev.map(a => selectedArr.includes(a.id) ? { ...a, flagStatus: "pending", isFlagged: true } : a));
        setSelectedIds(new Set());
        setShowFlagConfirm(false);
        setActionMsg({ type: "success", text: `${selectedArr.length} answer${selectedArr.length !== 1 ? "s" : ""} flagged and added to the Flags tab.` });
        setTimeout(() => setActionMsg(null), 5000);
      } else {
        setActionMsg({ type: "error", text: "Failed to flag answers. Please try again." });
        setTimeout(() => setActionMsg(null), 5000);
      }
    } catch {
      setActionMsg({ type: "error", text: "Network error. Please try again." });
      setTimeout(() => setActionMsg(null), 5000);
    } finally {
      setFlagging(false);
    }
  };

  const handleNormalize = async () => {
    const value = normalizeValue.trim();
    if (!value || selectedShortAnswerIds.length === 0) return;
    setNormalizing(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/answers/bulk-normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ answerIds: selectedShortAnswerIds, normalizedAnswer: value }),
      });
      if (res.ok) {
        setAnswers(prev => prev.map(a =>
          selectedShortAnswerIds.includes(a.id) ? { ...a, normalizedAnswer: value, isFlagged: false } : a
        ));
        setSelectedIds(new Set());
        setShowNormalizeModal(false);
        setNormalizeValue("");
        setActionMsg({ type: "success", text: `${selectedShortAnswerIds.length} answer${selectedShortAnswerIds.length !== 1 ? "s" : ""} normalized as "${value}".` });
        setTimeout(() => setActionMsg(null), 5000);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionMsg({ type: "error", text: data.error || "Failed to normalize. Please try again." });
        setTimeout(() => setActionMsg(null), 5000);
      }
    } catch {
      setActionMsg({ type: "error", text: "Network error. Please try again." });
      setTimeout(() => setActionMsg(null), 5000);
    } finally {
      setNormalizing(false);
    }
  };

  const activePanel = showNormalizeModal ? "normalize" : showFlagConfirm ? "flag" : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-card-border rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">
            Answers by {user.name || user.email}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
        </div>

        {/* Toolbar — shown when selections exist */}
        {selectedIds.size > 0 && (
          <div className="mb-3 flex items-center gap-2 flex-wrap p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-xs text-amber-700 font-medium">{selectedIds.size} selected</span>
            <div className="flex gap-2 ml-auto flex-wrap">
              {selectedShortAnswerIds.length > 0 && (
                <button
                  onClick={() => { setNormalizeValue(""); setShowNormalizeModal(true); setShowFlagConfirm(false); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold transition-colors"
                >
                  Merge / Normalize
                </button>
              )}
              <button
                onClick={() => { setShowFlagConfirm(true); setShowNormalizeModal(false); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 font-semibold transition-colors"
              >
                Flag Answer
              </button>
              <button
                onClick={() => { setSelectedIds(new Set()); setShowFlagConfirm(false); setShowNormalizeModal(false); }}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Action message */}
        {actionMsg && (
          <div className={`mb-3 px-3 py-2 rounded-xl text-xs font-medium ${actionMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {actionMsg.text}
          </div>
        )}

        {/* Answer list */}
        <div className="overflow-y-auto flex-1 space-y-2 min-h-0">
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : answers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No answers yet</p>
          ) : answers.map(a => {
            const isFlagged = a.flagStatus === "pending" || a.flagStatus === "removed" || a.isFlagged;
            const selected = selectedIds.has(a.id);
            return (
              <div
                key={a.id}
                className={`p-3 rounded-xl border transition-colors cursor-pointer ${selected ? "border-amber-400 bg-amber-50/60" : "border-border bg-muted/30 hover:border-amber-200"}`}
                onClick={() => toggleSelect(a.id)}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(a.id)}
                    onClick={e => e.stopPropagation()}
                    className="mt-0.5 w-3.5 h-3.5 accent-amber-500 flex-shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm leading-snug">{a.questionTitle || `Question #${a.questionId}`}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.questionType}</span>
                      {a.pollOption && <span className="text-xs text-foreground">Chose: <strong>{a.pollOption}</strong></span>}
                      {a.rating != null && <span className="text-xs text-foreground">Rating: <strong>{a.rating}/10</strong></span>}
                      {a.answerText && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">{a.answerText}</span>
                      )}
                      {a.normalizedAnswer && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">
                          Normalized: {a.normalizedAnswer}
                        </span>
                      )}
                      {isFlagged && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 font-medium">flagged</span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Normalize panel */}
        {activePanel === "normalize" && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm font-semibold text-foreground mb-1">Merge / Normalize ({selectedShortAnswerIds.length} answer{selectedShortAnswerIds.length !== 1 ? "s" : ""})</p>
            {hasAlreadyNormalized && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 mb-2">
                Some selected answers are already normalized — this will overwrite them.
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-2">Raw answer text is never changed. Only the display label is updated.</p>
            <input
              type="text"
              value={normalizeValue}
              onChange={e => setNormalizeValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && normalizeValue.trim()) handleNormalize(); if (e.key === "Escape") setShowNormalizeModal(false); }}
              placeholder='e.g. "Pakistan"'
              maxLength={100}
              autoFocus
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-amber-400 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNormalizeModal(false)}
                className="px-4 py-2 text-sm rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleNormalize} disabled={!normalizeValue.trim() || normalizing}
                className="px-4 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors">
                {normalizing ? "Applying…" : "Apply"}
              </button>
            </div>
          </div>
        )}

        {/* Flag confirmation panel */}
        {activePanel === "flag" && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-sm text-foreground mb-3">
              Flag <strong>{selectedArr.length}</strong> answer{selectedArr.length !== 1 ? "s" : ""}? They will be hidden from graphs and added to the Flags tab. A $0.10 penalty can be applied from there.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowFlagConfirm(false)}
                className="px-4 py-2 text-sm rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleFlag} disabled={flagging}
                className="px-4 py-2 text-sm rounded-xl bg-rose-600 text-white hover:bg-rose-700 font-semibold disabled:opacity-50 transition-colors">
                {flagging ? "Flagging…" : "Confirm Flag"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":             return "bg-green-50 text-green-700 border-green-200";
    case "rejected":           return "bg-red-50 text-red-700 border-red-200";
    case "pending":            return "bg-amber-50 text-amber-700 border-amber-200";
    case "hidden":             return "bg-gray-100 text-gray-600 border-gray-300";
    case "archived_duplicate": return "bg-purple-50 text-purple-700 border-purple-200";
    default:                   return "bg-amber-50 text-amber-700 border-amber-200";
  }
}

function QuestionRow({
  q,
  showApproveReject = false,
  onEdit,
  onToggleProfile,
  onFeature,
  onApprove,
  onReject,
  onDelete,
  onArchiveDuplicate,
  isProcessing = false,
}: {
  q: any;
  showApproveReject?: boolean;
  onEdit: (q: any) => void;
  onToggleProfile: (q: any) => void;
  onFeature: (id: number, isFeatured: boolean, position: number | null) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (id: number) => void;
  onArchiveDuplicate: (id: number) => void;
  isProcessing?: boolean;
}) {
  const [showFeaturedControls, setShowFeaturedControls] = useState(false);
  const [featurePos, setFeaturePos] = useState<number>(q.featuredPosition ?? 1);

  return (
    <div className={`relative bg-card border border-card-border rounded-xl p-5 shadow-sm transition-opacity ${isProcessing ? "opacity-60" : ""}`}>
      {/* Per-item processing overlay */}
      {isProcessing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-border shadow-sm">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-medium text-muted-foreground">Processing…</span>
          </div>
        </div>
      )}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusBadgeClass(q.status)}`}>
              {q.status === "archived_duplicate" ? "archived duplicate" : q.status}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">{q.type}</span>
            {((q as any).categories ?? [q.category]).map((cat: string) => (
              <span key={cat} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground">{cat}</span>
            ))}
            {q.isCustom && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Community</span>}
            {q.isProfileQuestion && <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Profile Q · 2¢</span>}
            {q.isFeatured && <span className="text-xs px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold">★ Featured #{q.featuredPosition}</span>}
          </div>
          <h3 className="font-semibold text-foreground text-sm mb-1">{q.title}</h3>
          {q.description && <p className="text-xs text-muted-foreground mb-1">{q.description}</p>}
          {q.status === "rejected" && (q as any).rejectionReason && (
            <p className="text-xs text-red-600 mb-1">
              <span className="font-semibold">Rejected:</span> {(q as any).rejectionReason}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {q.totalAnswers} answers
            {q.creatorName ? ` · by ${q.creatorName}` : ""}
            {" · "}{new Date(q.createdAt).toLocaleDateString()}
          </p>
          {q.pollOptions && q.pollOptions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {q.pollOptions.map((opt: string) => (
                <span key={opt} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{opt}</span>
              ))}
            </div>
          )}
          {/* Inline featured position controls */}
          {showFeaturedControls && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Position:</span>
              <select
                value={featurePos}
                onChange={e => setFeaturePos(Number(e.target.value))}
                className="text-xs border border-border rounded-lg px-2 py-1 bg-card focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <option key={n} value={n}>Slot #{n}</option>
                ))}
              </select>
              <button
                onClick={() => { onFeature(q.id, true, featurePos); setShowFeaturedControls(false); }}
                className="text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors"
              >
                Save
              </button>
              {q.isFeatured && (
                <button
                  onClick={() => { onFeature(q.id, false, null); setShowFeaturedControls(false); }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-medium hover:bg-red-100 transition-colors"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setShowFeaturedControls(false)}
                className="text-xs px-2.5 py-1 rounded-lg bg-muted text-muted-foreground hover:bg-muted/70 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => onEdit(q)}
            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
            Edit
          </button>
          <button
            onClick={() => onToggleProfile(q)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              q.isProfileQuestion
                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                : "bg-muted text-muted-foreground hover:bg-amber-50 hover:text-amber-700"
            }`}
          >
            {q.isProfileQuestion ? "Unmark Profile Q" : "Mark Profile Q"}
          </button>
          {q.status === "active" && (
            <button
              onClick={() => { setFeaturePos(q.featuredPosition ?? 1); setShowFeaturedControls(prev => !prev); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                q.isFeatured
                  ? "bg-purple-100 text-purple-800 hover:bg-purple-200"
                  : "bg-muted text-muted-foreground hover:bg-purple-50 hover:text-purple-700"
              }`}
            >
              {q.isFeatured ? "★ Featured" : "☆ Feature"}
            </button>
          )}
          {showApproveReject && (
            <>
              <button
                onClick={() => !isProcessing && onApprove(q.id)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {isProcessing
                  ? <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/></svg>
                  : null}
                Approve
              </button>
              <button
                onClick={() => !isProcessing && onReject(q.id)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-40 flex items-center gap-1"
              >
                {isProcessing
                  ? <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round"/></svg>
                  : null}
                Reject
              </button>
            </>
          )}
          {q.status !== "archived_duplicate" && (
            <button
              onClick={() => onArchiveDuplicate(q.id)}
              title="Hide from public view — preserves all answers, earnings, and transaction history"
              className="px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-xs font-medium hover:bg-purple-100 transition-colors">
              Archive Dup
            </button>
          )}
          <button onClick={() => onDelete(q.id)}
            title={q.totalAnswers > 0 ? `Blocked: ${q.totalAnswers} answer(s) exist — use Archive Duplicate` : "Permanently delete (safe: no answers)"}
            className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function BanUserModal({ user, reason, onReasonChange, banIp, onBanIpChange, onConfirm, onClose, isPending }: {
  user: any;
  reason: string;
  onReasonChange: (r: string) => void;
  banIp: boolean;
  onBanIpChange: (v: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-md shadow-xl"
      >
        <h2 className="text-base font-bold text-foreground mb-1">Ban User</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Banning <span className="font-semibold text-foreground">{user.name || user.email}</span> will block them from posting questions, submitting answers, and withdrawing funds. Their existing content will remain visible.
        </p>
        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              placeholder="e.g. Spam, abusive behaviour, fraud"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
          {user.lastIp && (
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border cursor-pointer hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={banIp}
                onChange={e => onBanIpChange(e.target.checked)}
                className="accent-red-600 shrink-0"
              />
              <span className="text-sm text-foreground">Also ban IP address <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{user.lastIp}</code></span>
            </label>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/70 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40"
          >
            {isPending ? "Banning…" : "Ban User"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Reusable infinite-scroll hook.
//
// Strategy (two complementary mechanisms, one strict guard):
//
//  1. Scroll listener + immediate check (primary)
//     Fires tryLoad() on every window scroll and immediately when the sentinel
//     element mounts.  Because it runs synchronously, it is guaranteed to catch
//     the case where the first batch of items never fills the viewport.
//
//  2. Post-fetch re-check (secondary)
//     Fires when `loading` transitions to false.  Catches the case where the
//     IO / scroll path was blocked while a fetch was in flight.
//
//  3. Deduplication guard
//     `loadingRef` is set to `true` BEFORE calling onLoadMore.  Both paths
//     check this ref first so at most one request is in flight at a time.
//     The ref is kept in sync with the `loading` prop so it resets correctly
//     when each fetch finishes.
function useInfiniteScroll(
  onLoadMore: () => void,
  hasMore: boolean,
  loading: boolean,
) {
  const callbackRef = useRef(onLoadMore);
  const hasMoreRef  = useRef(hasMore);
  const loadingRef  = useRef(loading);

  // Keep all three refs in sync every render (no stale closures in scroll handler)
  useEffect(() => { callbackRef.current = onLoadMore; });
  useEffect(() => { hasMoreRef.current  = hasMore;  }, [hasMore]);
  useEffect(() => { loadingRef.current  = loading;  }, [loading]);

  // We need the sentinel element to trigger effects — use state so React tracks it
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  // ── PRIMARY: scroll listener + immediate mount check ──────────────────────
  useEffect(() => {
    if (!element) return;

    const tryLoad = () => {
      if (loadingRef.current || !hasMoreRef.current) return;
      const rect = element.getBoundingClientRect();
      // 400 px ahead of the viewport bottom
      if (rect.top <= window.innerHeight + 400) {
        loadingRef.current = true; // optimistic lock — prevents double-fire
        callbackRef.current();
      }
    };

    tryLoad(); // synchronous check: fires immediately if sentinel is visible
    window.addEventListener("scroll", tryLoad, { passive: true });
    return () => window.removeEventListener("scroll", tryLoad);
  }, [element]);

  // ── SECONDARY: re-check when a fetch completes ────────────────────────────
  // `loading` is in deps, so this runs each time a fetch finishes.
  // `loadingRef.current` guards against double-firing with the primary path
  // (primary runs first in React's effect order, sets the lock).
  useEffect(() => {
    if (!element || loading || !hasMore) return;
    if (loadingRef.current) return; // already handled by primary path
    const rect = element.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 400) {
      loadingRef.current = true;
      callbackRef.current();
    }
  }, [loading, hasMore, element]);

  // Stable callback ref: React calls this when the sentinel mounts / unmounts
  return useCallback((el: HTMLDivElement | null) => setElement(el), []);
}

export default function Admin() {
  const { data: me } = useGetMe();
  const { getToken } = useAuth();
  const [tab, setTab] = useState<AdminTab>("questions");
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userQuestionsUser, setUserQuestionsUser] = useState<any | null>(null);
  const [userAnswersUser, setUserAnswersUser] = useState<any | null>(null);
  const [growthRange, setGrowthRange] = useState("30");
  const [earningsRange, setEarningsRange] = useState("30");
  const [adminSearch, setAdminSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userSort, setUserSort] = useState<string>("newest");
  const [byUserData, setByUserData] = useState<any[] | null>(null);
  const [byUserLoading, setByUserLoading] = useState(false);
  const [expandedReferrer, setExpandedReferrer] = useState<string | null>(null);
  const [editorToggling, setEditorToggling] = useState<string | null>(null);
  const [flagsData, setFlagsData] = useState<{ items: any[]; total: number; pending: number; resolved: number; removed: number } | null>(null);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [flagsPage, setFlagsPage] = useState(1);
  const [flagsHasMore, setFlagsHasMore] = useState(false);
  const [flagsTotal, setFlagsTotal] = useState(0);
  const [flagsError, setFlagsError] = useState<string | null>(null);
  const [flagActionId, setFlagActionId] = useState<number | null>(null);
  const [flagFilter, setFlagFilter] = useState<"all" | "pending" | "resolved" | "removed">("pending");
  const [flagSort, setFlagSort] = useState<"newest" | "oldest" | "most-flagged">("newest");
  const [selectedFlagIds, setSelectedFlagIds] = useState<Set<number>>(new Set());
  const [bulkModal, setBulkModal] = useState<null | "clear" | "remove">(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [flagNotification, setFlagNotification] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [transferMsg, setTransferMsg] = useState<{ type: "success" | "warn"; text: string } | null>(null);
  const [verificationsData, setVerificationsData] = useState<{ users: any[]; pending: number; approved: number; rejected: number; reupload: number } | null>(null);
  const [verificationsLoading, setVerificationsLoading] = useState(false);
  const [verificationsLoaded, setVerificationsLoaded] = useState(false);
  const [verificationsError, setVerificationsError] = useState<string | null>(null);
  const [verificationsPage, setVerificationsPage] = useState(1);
  const [verificationsHasMore, setVerificationsHasMore] = useState(false);
  const [verificationsTotal, setVerificationsTotal] = useState(0);
  const [verifActionId, setVerifActionId] = useState<string | null>(null);
  const [verifRejectId, setVerifRejectId] = useState<string | null>(null);
  const [verifRejectReason, setVerifRejectReason] = useState("");
  const [verifSearch, setVerifSearch] = useState("");
  const [verifFilter, setVerifFilter] = useState<"all" | "pending" | "approved" | "rejected" | "reupload_requested">("all");
  const [rejectModalId, setRejectModalId] = useState<number | null>(null);
  // ── Ban system state ──────────────────────────────────────────────────────
  const [banModalUser, setBanModalUser] = useState<any | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banIp, setBanIp] = useState(false);
  const [banToggling, setBanToggling] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  // ── Per-tab paginated data (lazy-loaded, not React Query) ─────────────────
  const [adminCounts, setAdminCounts] = useState<{ pendingQuestions: number; pendingWithdrawals: number; pendingVerifications: number; pendingFlags: number } | null>(null);
  // Pending questions (paginated)
  const [pendingQuestions, setPendingQuestions] = useState<any[]>([]);
  const [pendingQLoading, setPendingQLoading] = useState(false);
  const [pendingQLoaded, setPendingQLoaded] = useState(false);
  const [pendingQError, setPendingQError] = useState<string | null>(null);
  const [pendingQPage, setPendingQPage] = useState(1);
  const [pendingQHasMore, setPendingQHasMore] = useState(false);
  const [pendingQTotal, setPendingQTotal] = useState(0);
  // Per-item processing state — tracks which question IDs have an in-flight API call.
  // Only that specific item's buttons are disabled; all others remain interactive.
  const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());
  const addProcessingId    = useCallback((id: number) => setProcessingIds(p => new Set([...p, id])), []);
  const removeProcessingId = useCallback((id: number) => setProcessingIds(p => { const n = new Set(p); n.delete(id); return n; }), []);
  // All questions (paginated)
  const [allQuestions, setAllQuestions] = useState<any[]>([]);
  const [allQLoading, setAllQLoading] = useState(false);
  const [allQLoaded, setAllQLoaded] = useState(false);
  const [allQPage, setAllQPage] = useState(1);
  const [allQHasMore, setAllQHasMore] = useState(false);
  const [allQTotal, setAllQTotal] = useState(0);
  const [allQError, setAllQError] = useState<string | null>(null);
  // Users (paginated)
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersPage, setUsersPage] = useState(1);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersError, setUsersError] = useState<string | null>(null);
  // Withdrawals (paginated)
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalsLoaded, setWithdrawalsLoaded] = useState(false);
  const [withdrawalsPage, setWithdrawalsPage] = useState(1);
  const [withdrawalsHasMore, setWithdrawalsHasMore] = useState(false);
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0);
  const [withdrawalsError, setWithdrawalsError] = useState<string | null>(null);
  const [withdrawalStatus, setWithdrawalStatus] = useState<string>("");
  // Referral list (paginated, replaces React Query hook)
  const [referralList, setReferralList] = useState<any[]>([]);
  const [refListLoading, setRefListLoading] = useState(false);
  const [refListLoaded, setRefListLoaded] = useState(false);
  const [refListPage, setRefListPage] = useState(1);
  const [refListHasMore, setRefListHasMore] = useState(false);
  const [refListTotal, setRefListTotal] = useState(0);
  const [refListError, setRefListError] = useState<string | null>(null);
  // Debounce admin search — prevents expensive filter/sort on every keystroke
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(adminSearch), 200);
    return () => clearTimeout(id);
  }, [adminSearch]);

  const isStatsTab = tab === "stats";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: statsData } = useGetAdminStats({ query: { enabled: isStatsTab } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: growthData, isLoading: growthLoading } = useGetAdminGrowth({ days: growthRange }, { query: { enabled: isStatsTab } as any });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: earningsData, isLoading: earningsLoading } = useGetAdminEarningsAnalytics({ range: earningsRange as any }, { query: { enabled: isStatsTab } as any });
  const approveQuestion = useApproveQuestion();
  const rejectQuestion = useRejectQuestion();
  const approveWithdrawal = useApproveWithdrawal();
  const rejectWithdrawalMutation = useRejectWithdrawalAdmin();
  const transferWithdrawalMutation = useTransferWithdrawal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: refStatsData, refetch: refetchRefStats } = useGetAdminReferralStats({ query: { enabled: tab === "referrals" } as any });
  const patchRefStatus = usePatchAdminReferralStatus();
  const reverseRef = useReverseAdminReferral();

  function refetchReferrals() {
    refetchRefStats();
    setReferralList([]);
    setRefListPage(1);
    setRefListError(null);
    setRefListLoaded(false);
  }

  // ── Fetch functions ──────────────────────────────────────────────────────
  const fetchAdminCounts = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/counts", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) setAdminCounts(await res.json());
    } catch {}
  }, [getToken]);

  const fetchPendingQuestions = useCallback(async (page = 1) => {
    setPendingQLoading(true);
    if (page === 1) setPendingQError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/questions?status=pending&page=${page}&limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) setPendingQuestions(json.questions ?? []);
        else setPendingQuestions(prev => [...prev, ...(json.questions ?? [])]);
        setPendingQPage(page); setPendingQHasMore(json.hasMore ?? false); setPendingQTotal(json.total ?? 0); setPendingQLoaded(true);
      } else setPendingQError(`Server error: ${res.status}`);
    } catch (err: any) {
      setPendingQError(err?.name === "TimeoutError" ? "Request timed out." : "Failed to load pending questions.");
    } finally { setPendingQLoading(false); }
  }, [getToken]);

  const fetchAllQuestions = useCallback(async (page = 1, q = "") => {
    setAllQLoading(true);
    if (page === 1) setAllQError(null);
    try {
      const token = await getToken();
      const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/admin/questions?page=${page}&limit=50${qParam}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) setAllQuestions(json.questions ?? []); else setAllQuestions(prev => [...prev, ...(json.questions ?? [])]);
        setAllQPage(page); setAllQHasMore(json.hasMore ?? false); setAllQTotal(json.total ?? 0); setAllQLoaded(true);
      } else { setAllQError(`Server error: ${res.status}`); }
    } catch (err: any) {
      setAllQError(err?.name === "TimeoutError" ? "Request timed out." : "Failed to load questions.");
    } finally { setAllQLoading(false); }
  }, [getToken]);

  const fetchUsers = useCallback(async (page = 1, search = "", sort = "") => {
    setUsersLoading(true);
    if (page === 1) setUsersError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search) params.set("search", search);
      if (sort) params.set("sort", sort);
      const url = `/api/admin/users?${params.toString()}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) setUsers(json.users ?? []); else setUsers(prev => [...prev, ...(json.users ?? [])]);
        setUsersPage(page); setUsersHasMore(json.hasMore ?? false); setUsersTotal(json.total ?? 0); setUsersLoaded(true);
      } else { setUsersError(`Server error: ${res.status}`); }
    } catch (err: any) {
      setUsersError(err?.name === "TimeoutError" ? "Request timed out." : "Failed to load users.");
    } finally { setUsersLoading(false); }
  }, [getToken]);

  const fetchWithdrawals = useCallback(async (page = 1, status = "") => {
    setWithdrawalsLoading(true);
    if (page === 1) setWithdrawalsError(null);
    try {
      const token = await getToken();
      const statusParam = status ? `&status=${encodeURIComponent(status)}` : "";
      const res = await fetch(`/api/admin/withdrawals?page=${page}&limit=50${statusParam}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) setWithdrawals(json.transactions ?? []); else setWithdrawals(prev => [...prev, ...(json.transactions ?? [])]);
        setWithdrawalsPage(page); setWithdrawalsHasMore(json.hasMore ?? false); setWithdrawalsTotal(json.total ?? 0); setWithdrawalsLoaded(true);
      } else { setWithdrawalsError(`Server error: ${res.status}`); }
    } catch (err: any) {
      setWithdrawalsError(err?.name === "TimeoutError" ? "Request timed out." : "Failed to load withdrawals.");
    } finally { setWithdrawalsLoading(false); }
  }, [getToken]);

  const fetchReferralList = useCallback(async (page = 1) => {
    setRefListLoading(true);
    if (page === 1) setRefListError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/referrals/admin/list?page=${page}&limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) setReferralList(json.referrals ?? []); else setReferralList(prev => [...prev, ...(json.referrals ?? [])]);
        setRefListPage(page); setRefListHasMore(json.hasMore ?? false); setRefListTotal(json.total ?? 0); setRefListLoaded(true);
      } else { setRefListError(`Server error: ${res.status}`); }
    } catch (err: any) {
      setRefListError(err?.name === "TimeoutError" ? "Request timed out." : "Failed to load referrals.");
    } finally { setRefListLoading(false); }
  }, [getToken]);

  // ── Lazy load on tab change (use 'loaded' flag as cache) ──────────────────
  useEffect(() => { if (me?.isAdmin || me?.isEditor) fetchAdminCounts(); }, [me?.isAdmin, me?.isEditor, fetchAdminCounts]);
  useEffect(() => { if (tab === "questions" && !pendingQLoaded) fetchPendingQuestions(1); }, [tab, pendingQLoaded, fetchPendingQuestions]);
  useEffect(() => { if (tab === "all-questions" && !allQLoaded) fetchAllQuestions(1, debouncedSearch); }, [tab, allQLoaded, fetchAllQuestions, debouncedSearch]);
  useEffect(() => { if (tab === "users" && !usersLoaded) fetchUsers(1, debouncedSearch, userSort); }, [tab, usersLoaded, fetchUsers, debouncedSearch, userSort]);
  useEffect(() => { if (tab === "withdrawals" && !withdrawalsLoaded) fetchWithdrawals(1, withdrawalStatus); }, [tab, withdrawalsLoaded, fetchWithdrawals, withdrawalStatus]);
  useEffect(() => { if (tab === "referrals" && !refListLoaded) fetchReferralList(1); }, [tab, refListLoaded, fetchReferralList]);

  // ── Pending Review: auto-drain ─────────────────────────────────────────────
  // Automatically loads the next page as soon as the previous one finishes,
  // with no scrolling required.  Isolated to the "questions" tab only.
  //
  // Guard: pendingLastDrainedPageRef tracks the highest page we have already
  // dispatched.  The ref resets to 0 whenever page resets to 1 (fresh load /
  // filter change) so stale values from a previous session never block loading.
  const pendingLastDrainedPageRef = useRef(0);
  // Reset the guard whenever the list starts over (page back to 1).
  useEffect(() => {
    if (pendingQPage === 1) pendingLastDrainedPageRef.current = 0;
  }, [pendingQPage]);
  // Core drain loop.
  useEffect(() => {
    if (tab !== "questions") return;       // only on Pending Review tab
    if (!pendingQLoaded) return;           // wait for the first page to arrive
    if (!pendingQHasMore) return;          // nothing more to load
    if (pendingQLoading) return;           // a fetch is already in flight

    const nextPage = pendingQPage + 1;
    if (nextPage <= pendingLastDrainedPageRef.current) return; // already requested

    const timer = setTimeout(() => {
      pendingLastDrainedPageRef.current = nextPage;
      fetchPendingQuestions(nextPage);
    }, 150); // small delay prevents hammering and lets React batch state updates

    return () => clearTimeout(timer);
  }, [tab, pendingQLoaded, pendingQHasMore, pendingQLoading, pendingQPage, fetchPendingQuestions]);

  // ── User search/sort: reset loaded flag when debounced search or sort changes ─
  const prevSearchRef = useRef(debouncedSearch);
  const prevUserSortRef = useRef(userSort);
  useEffect(() => {
    const searchChanged = debouncedSearch !== prevSearchRef.current;
    const sortChanged   = userSort !== prevUserSortRef.current;
    if (tab === "users" && (searchChanged || sortChanged)) {
      prevSearchRef.current  = debouncedSearch;
      prevUserSortRef.current = userSort;
      setUsers([]); setUsersPage(1); setUsersLoaded(false);
      // usersLoaded = false triggers the lazy load effect which passes debouncedSearch + userSort
    }
  }, [tab, debouncedSearch, userSort]);

  // Toggle Editor role for a user (admin-only action)
  const handleToggleEditor = useCallback(async (clerkId: string) => {
    setEditorToggling(clerkId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${clerkId}/toggle-editor`, {
        method: "PATCH",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(prev => prev.map(u => u.clerkId === clerkId ? { ...u, isEditor: data.isEditor } : u));
      }
    } finally {
      setEditorToggling(null);
    }
  }, [getToken]);

  // Fetch per-referrer analytics whenever the referrals tab is active
  const fetchByUser = useCallback(async () => {
    setByUserLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/referrals/admin/by-user", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        setByUserData(json.referrers ?? []);
      }
    } finally {
      setByUserLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (tab === "referrals") fetchByUser();
  }, [tab, fetchByUser]);

  const fetchFlags = useCallback(async (page = 1, status = "pending", sort = "newest") => {
    setFlagsLoading(true);
    if (page === 1) setFlagsError(null);
    try {
      const token = await getToken();
      const statusParam = status && status !== "all" ? `&status=${encodeURIComponent(status)}` : "";
      const sortParam = sort !== "newest" ? `&sort=${encodeURIComponent(sort)}` : "";
      const res = await fetch(`/api/admin/flags?page=${page}&limit=50${statusParam}${sortParam}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) {
          setFlagsData({ items: json.items ?? [], total: json.total ?? 0, pending: json.pending ?? 0, resolved: json.resolved ?? 0, removed: json.removed ?? 0 });
        } else {
          setFlagsData(prev => prev
            ? { ...prev, items: [...prev.items, ...(json.items ?? [])] }
            : { items: json.items ?? [], total: json.total ?? 0, pending: json.pending ?? 0, resolved: json.resolved ?? 0, removed: json.removed ?? 0 }
          );
        }
        setFlagsPage(page);
        setFlagsHasMore(json.hasMore ?? false);
        setFlagsTotal(json.total ?? 0);
        setFlagsLoaded(true);
      } else {
        setFlagsError(`Server error: ${res.status}`);
      }
    } catch (err: any) {
      setFlagsError(err?.name === "TimeoutError" ? "Request timed out — server may be busy." : "Failed to load flags.");
    } finally {
      setFlagsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (tab === "flags" && !flagsLoaded) fetchFlags(1, flagFilter, flagSort);
  }, [tab, flagsLoaded, fetchFlags, flagFilter, flagSort]);

  const fetchVerifications = useCallback(async (page = 1, status = "", q = "") => {
    setVerificationsLoading(true);
    if (page === 1) setVerificationsError(null);
    try {
      const token = await getToken();
      const statusParam = status && status !== "all" ? `&status=${encodeURIComponent(status)}` : "";
      const qParam = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
      const res = await fetch(`/api/admin/verifications?page=${page}&limit=50${statusParam}${qParam}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const json = await res.json();
        if (page === 1) {
          setVerificationsData({ users: json.users ?? [], pending: json.pending ?? 0, approved: json.approved ?? 0, rejected: json.rejected ?? 0, reupload: json.reupload ?? 0 });
        } else {
          setVerificationsData(prev => prev ? { ...prev, users: [...prev.users, ...(json.users ?? [])] } : null);
        }
        setVerificationsPage(page);
        setVerificationsHasMore(json.hasMore ?? false);
        setVerificationsTotal(json.total ?? 0);
        setVerificationsLoaded(true);
      } else { setVerificationsError(`Server error: ${res.status}`); }
    } catch (err: any) {
      setVerificationsError(err?.name === "TimeoutError" ? "Request timed out." : "Failed to load verifications.");
    } finally {
      setVerificationsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (tab === "verifications" && !verificationsLoaded) fetchVerifications(1, verifFilter === "all" ? "" : verifFilter, verifSearch);
  }, [tab, verificationsLoaded, fetchVerifications, verifFilter, verifSearch]);

  const handleVerifApprove = async (userId: string) => {
    setVerifActionId(userId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/verifications/${userId}/approve`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) await fetchVerifications();
    } finally {
      setVerifActionId(null);
    }
  };

  const handleVerifReject = async (userId: string, reason: string) => {
    setVerifActionId(userId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/verifications/${userId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) { setVerifRejectId(null); setVerifRejectReason(""); await fetchVerifications(); }
    } finally {
      setVerifActionId(null);
    }
  };

  const handleVerifRequestReupload = async (userId: string, reason: string) => {
    setVerifActionId(userId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/verifications/${userId}/request-reupload`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason: reason || "Please upload a clearer, valid identity document." }),
      });
      if (res.ok) await fetchVerifications();
    } finally {
      setVerifActionId(null);
    }
  };

  // ── Ban / Unban handlers ────────────────────────────────────────────────
  const handleBanUser = useCallback(async (clerkId: string, reason: string, alsobanIp: boolean) => {
    setBanToggling(clerkId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${clerkId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason: reason.trim() || undefined, banIp: alsobanIp }),
      });
      if (res.ok) {
        setBanModalUser(null);
        setBanReason("");
        setBanIp(false);
        setUsers(prev => prev.map(u => u.clerkId === clerkId ? { ...u, isBanned: true, banReason: reason.trim() || null } : u));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to ban user.");
      }
    } finally {
      setBanToggling(null);
    }
  }, [getToken]);

  const handleUnbanUser = useCallback(async (clerkId: string) => {
    if (!confirm("Unban this user? They will regain full access to the platform.")) return;
    setBanToggling(clerkId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/users/${clerkId}/unban`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.clerkId === clerkId ? { ...u, isBanned: false, banReason: null } : u));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to unban user.");
      }
    } finally {
      setBanToggling(null);
    }
  }, [getToken]);


  // ── In-place flag state helpers (no full refetch) ────────────────────────
  const applyFlagStatusLocally = (answerIds: number[], newStatus: "removed" | null) => {
    setFlagsData(prev => {
      if (!prev) return prev;
      const idSet = new Set(answerIds);
      const items = prev.items.map(item => {
        if (!idSet.has(item.answerId)) return item;
        const updatedFlags = item.flags.map((f: any) => ({
          ...f, status: newStatus === "removed" ? "removed" : "ignored",
        }));
        return { ...item, flagStatus: newStatus === "removed" ? "removed" : null, flags: updatedFlags };
      });
      const pending  = items.filter(i => i.flagStatus === "pending").length;
      const removed  = items.filter(i => i.flagStatus === "removed").length;
      const resolved = items.filter(i => i.flagStatus !== "pending" && i.flagStatus !== "removed").length;
      return { items, total: prev.total, pending, resolved, removed };
    });
  };

  const applyFlagIgnoreLocally = (flagId: number) => {
    setFlagsData(prev => {
      if (!prev) return prev;
      const items = prev.items.map(item => {
        if (!item.flags.some((f: any) => f.id === flagId)) return item;
        const updatedFlags = item.flags.map((f: any) => f.id === flagId ? { ...f, status: "ignored" } : f);
        const anyPending = updatedFlags.some((f: any) => f.status === "pending");
        return { ...item, flags: updatedFlags, flagStatus: anyPending ? item.flagStatus : null };
      });
      const pending  = items.filter(i => i.flagStatus === "pending").length;
      const removed  = items.filter(i => i.flagStatus === "removed").length;
      const resolved = items.filter(i => i.flagStatus !== "pending" && i.flagStatus !== "removed").length;
      return { items, total: prev.total, pending, resolved, removed };
    });
  };

  const handleFlagRemoveAnswer = async (answerId: number) => {
    if (!confirm("Permanently remove this answer from the platform?\n\nA $0.10 penalty will be deducted from the user's wallet.")) return;
    setFlagActionId(answerId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/answers/${answerId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const json = await res.json();
        applyFlagStatusLocally([answerId], "removed");
        const penaltyMsg = json.penaltyApplied
          ? (json.fullPenalty ? "Answer removed and $0.10 penalty applied." : "Answer removed and available balance penalty applied.")
          : "Answer removed.";
        setFlagNotification({ type: "success", msg: penaltyMsg });
        setTimeout(() => setFlagNotification(null), 6000);
      } else {
        setFlagNotification({ type: "error", msg: "Failed to remove answer. Please try again." });
      }
    } finally {
      setFlagActionId(null);
    }
  };

  const handleFlagIgnore = async (flagId: number) => {
    setFlagActionId(flagId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/flags/${flagId}/ignore`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) applyFlagIgnoreLocally(flagId);
    } finally {
      setFlagActionId(null);
    }
  };

  const handleClearFlag = async (answerId: number) => {
    setFlagActionId(answerId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/answers/${answerId}/clear-flag`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) applyFlagStatusLocally([answerId], null);
    } finally {
      setFlagActionId(null);
    }
  };

  const handleBulkClear = async () => {
    setBulkLoading(true);
    try {
      const token = await getToken();
      const ids = Array.from(selectedFlagIds);
      const res = await fetch("/api/admin/flags/bulk-clear", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ answerIds: ids }),
      });
      if (res.ok) {
        const json = await res.json();
        applyFlagStatusLocally(ids, null);
        setFlagNotification({ type: "success", msg: `${json.processed} flag${json.processed !== 1 ? "s" : ""} cleared successfully` });
        setSelectedFlagIds(new Set());
        setBulkModal(null);
        setTimeout(() => setFlagNotification(null), 6000);
      } else {
        setFlagNotification({ type: "error", msg: "Failed to clear flags. Please try again." });
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkRemove = async () => {
    setBulkLoading(true);
    try {
      const token = await getToken();
      const ids = Array.from(selectedFlagIds);
      const res = await fetch("/api/admin/flags/bulk-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ answerIds: ids }),
      });
      if (res.ok) {
        const json = await res.json();
        applyFlagStatusLocally(ids, "removed");
        const penaltyNote = json.penaltiesApplied > 0
          ? ` $0.10 penalty applied to ${json.penaltiesApplied} user${json.penaltiesApplied !== 1 ? "s" : ""}.`
          : "";
        setFlagNotification({ type: "success", msg: `${json.processed} answer${json.processed !== 1 ? "s" : ""} removed.${penaltyNote}` });
        setSelectedFlagIds(new Set());
        setBulkModal(null);
        setTimeout(() => setFlagNotification(null), 8000);
      } else {
        setFlagNotification({ type: "error", msg: "Failed to remove answers. Please try again." });
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const updateWithdrawalStatus = (id: number, status: string) => {
    setWithdrawals(prev => prev.map(tx =>
      tx.id === id ? { ...tx, status, ...(status === "approved" ? { approvedAt: new Date().toISOString() } : {}), ...(status === "transferred" ? { transferredAt: new Date().toISOString() } : {}) } : tx
    ));
  };

  const handleEdit = useCallback((q: any) => setEditingQuestion(q), []);

  const handleToggleProfile = useCallback(async (q: any) => {
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isProfileQuestion: !q.isProfileQuestion }),
    });
    if (res.ok) {
      const updated = await res.json();
      const updater = (prev: any[]) => prev.map(item => item.id === q.id ? { ...item, isProfileQuestion: updated.isProfileQuestion } : item);
      setPendingQuestions(updater);
      setAllQuestions(updater);
    }
  }, [getToken]);

  const handleFeatureQuestion = useCallback(async (id: number, isFeatured: boolean, position: number | null) => {
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${id}/featured`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isFeatured, featuredPosition: position }),
    });
    if (res.ok) {
      const updater = (prev: any[]) => prev.map(item => item.id === id ? { ...item, isFeatured, featuredPosition: position } : item);
      setPendingQuestions(updater);
      setAllQuestions(updater);
    }
  }, [getToken]);

  const handleApproveQuestion = useCallback((id: number) => {
    if (processingIds.has(id)) return;
    // Capture the item and its position for rollback on failure
    const snapshot = pendingQuestions.find(q => q.id === id);
    const snapshotIndex = pendingQuestions.findIndex(q => q.id === id);
    // Mark as in-flight — shows per-item spinner, locks only this row
    addProcessingId(id);
    // Optimistically remove from pending list for instant visual feedback
    setPendingQuestions(prev => prev.filter(q => q.id !== id));
    setAdminCounts(prev => prev ? { ...prev, pendingQuestions: Math.max(0, prev.pendingQuestions - 1) } : prev);
    approveQuestion.mutate({ id }, {
      onSuccess: () => {
        removeProcessingId(id);
        setAllQuestions(prev => prev.map(q => q.id === id ? { ...q, status: "active" } : q));
      },
      onError: () => {
        removeProcessingId(id);
        // Rollback: re-insert at original position
        if (snapshot) {
          setPendingQuestions(prev => {
            const next = [...prev];
            next.splice(Math.min(snapshotIndex, next.length), 0, snapshot);
            return next;
          });
          setAdminCounts(prev => prev ? { ...prev, pendingQuestions: prev.pendingQuestions + 1 } : prev);
        }
      },
    });
  }, [approveQuestion, pendingQuestions, processingIds, addProcessingId, removeProcessingId]);

  const handleRejectQuestion = useCallback((id: number) => {
    setRejectReason("");
    setRejectModalId(id);
  }, []);

  const confirmRejectQuestion = useCallback(() => {
    if (rejectModalId === null || !rejectReason) return;
    const idToReject = rejectModalId;
    const reasonToSend = rejectReason;
    if (processingIds.has(idToReject)) return;
    // Capture for rollback
    const snapshot = pendingQuestions.find(q => q.id === idToReject);
    const snapshotIndex = pendingQuestions.findIndex(q => q.id === idToReject);
    // Close modal immediately, mark in-flight
    setRejectModalId(null);
    setRejectReason("");
    addProcessingId(idToReject);
    // Optimistic removal
    setPendingQuestions(prev => prev.filter(q => q.id !== idToReject));
    setAdminCounts(prev => prev ? { ...prev, pendingQuestions: Math.max(0, prev.pendingQuestions - 1) } : prev);
    rejectQuestion.mutate({ id: idToReject, data: { rejectionReason: reasonToSend } }, {
      onSuccess: () => {
        removeProcessingId(idToReject);
        setAllQuestions(prev => prev.map(q => q.id === idToReject ? { ...q, status: "rejected", rejectionReason: reasonToSend } : q));
      },
      onError: () => {
        removeProcessingId(idToReject);
        // Rollback
        if (snapshot) {
          setPendingQuestions(prev => {
            const next = [...prev];
            next.splice(Math.min(snapshotIndex, next.length), 0, snapshot);
            return next;
          });
          setAdminCounts(prev => prev ? { ...prev, pendingQuestions: prev.pendingQuestions + 1 } : prev);
        }
      },
    });
  }, [rejectModalId, rejectReason, rejectQuestion, pendingQuestions, processingIds, addProcessingId, removeProcessingId]);

  const handleDeleteQuestion = useCallback(async (id: number) => {
    if (!confirm("Permanently delete this question?\n\nThis will fail if the question already has answers — use 'Archive Duplicate' instead.")) return;
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setPendingQuestions(prev => prev.filter(q => q.id !== id));
      setAllQuestions(prev => prev.filter(q => q.id !== id));
    } else if (res.status === 409) {
      const data = await res.json();
      alert(`Cannot delete: ${data.error}\n\n${data.suggestion}`);
    }
  }, [getToken]);

  const handleArchiveDuplicate = useCallback(async (id: number) => {
    if (!confirm("Archive this question as a duplicate?\n\nIt will be hidden from public view, but all answers, earnings, and transaction history will be fully preserved.")) return;
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${id}/archive-duplicate`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      setPendingQuestions(prev => prev.filter(q => q.id !== id));
      setAllQuestions(prev => prev.map(q => q.id === id ? { ...q, status: "archived_duplicate" } : q));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to archive question");
    }
  }, [getToken]);

  const isEditorOnly = !me?.isAdmin && !!me?.isEditor;

  if (!me?.isAdmin && !me?.isEditor) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Required</h1>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
        <Link href="/dashboard">
          <button className="mt-6 px-6 py-2.5 rounded-xl gold-gradient text-white font-semibold shadow-sm hover:opacity-90">Back to Dashboard</button>
        </Link>
      </div>
    );
  }

  const searchTerm = debouncedSearch.trim().toLowerCase();

  const filteredQuestions = allQuestions;

  // sortedUsers removed — sorting is now server-side via the `sort` query param.

  // O(1) lookup map for withdrawal → full user (avoids O(n*m) .find() in render)
  const usersMap = useMemo(() =>
    Object.fromEntries(users.map((u: any) => [u.clerkId, u])),
    [users]
  );

  const stats = statsData;

  // ── Infinite scroll sentinel refs ────────────────────────────────────────
  const pendingQSentinelRef = useInfiniteScroll(
    () => fetchPendingQuestions(pendingQPage + 1),
    pendingQHasMore, pendingQLoading,
  );
  const allQSentinelRef = useInfiniteScroll(
    () => fetchAllQuestions(allQPage + 1, debouncedSearch),
    allQHasMore, allQLoading,
  );
  const withdrawalsSentinelRef = useInfiniteScroll(
    () => fetchWithdrawals(withdrawalsPage + 1, withdrawalStatus),
    withdrawalsHasMore, withdrawalsLoading,
  );
  const usersSentinelRef = useInfiniteScroll(
    () => fetchUsers(usersPage + 1, debouncedSearch, userSort),
    usersHasMore, usersLoading,
  );
  const refListSentinelRef = useInfiniteScroll(
    () => fetchReferralList(refListPage + 1),
    refListHasMore, refListLoading,
  );
  const verifSentinelRef = useInfiniteScroll(
    () => fetchVerifications(verificationsPage + 1, verifFilter === "all" ? "" : verifFilter, verifSearch),
    verificationsHasMore, verificationsLoading,
  );
  const flagsSentinelRef = useInfiniteScroll(
    () => fetchFlags(flagsPage + 1, flagFilter, flagSort),
    flagsHasMore, flagsLoading,
  );


  // ── Search / filter reset effects ────────────────────────────────────────────
  const prevAllQSearchRef = useRef(debouncedSearch);
  useEffect(() => {
    if (debouncedSearch !== prevAllQSearchRef.current) {
      prevAllQSearchRef.current = debouncedSearch;
      setAllQuestions([]); setAllQPage(1); setAllQLoaded(false);
    }
  }, [debouncedSearch]);
  const prevFlagFilterRef = useRef(flagFilter);
  const prevFlagSortRef = useRef(flagSort);
  useEffect(() => {
    if (flagFilter !== prevFlagFilterRef.current || flagSort !== prevFlagSortRef.current) {
      prevFlagFilterRef.current = flagFilter;
      prevFlagSortRef.current = flagSort;
      setFlagsData(null); setFlagsPage(1); setFlagsLoaded(false); setSelectedFlagIds(new Set());
    }
  }, [flagFilter, flagSort]);
  const prevVerifFilterRef = useRef(verifFilter);
  const prevVerifSearchRef = useRef(verifSearch);
  useEffect(() => {
    if (verifFilter !== prevVerifFilterRef.current || verifSearch !== prevVerifSearchRef.current) {
      prevVerifFilterRef.current = verifFilter;
      prevVerifSearchRef.current = verifSearch;
      setVerificationsData(null); setVerificationsPage(1); setVerificationsLoaded(false);
    }
  }, [verifFilter, verifSearch]);
  const prevWithdrawalStatusRef = useRef(withdrawalStatus);
  useEffect(() => {
    if (withdrawalStatus !== prevWithdrawalStatusRef.current) {
      prevWithdrawalStatusRef.current = withdrawalStatus;
      setWithdrawals([]); setWithdrawalsPage(1); setWithdrawalsLoaded(false);
    }
  }, [withdrawalStatus]);

  const allTabs: { key: AdminTab; label: string; badge?: number }[] = [
    { key: "questions", label: "Pending Review", badge: adminCounts?.pendingQuestions ?? 0 },
    { key: "all-questions", label: "All Questions" },
    { key: "withdrawals", label: "Withdrawals", badge: adminCounts?.pendingWithdrawals ?? 0 },
    { key: "users", label: "Users" },
    { key: "stats", label: "Stats" },
    { key: "referrals", label: "Referrals", badge: refStatsData?.flaggedCount ?? 0 },
    { key: "flags", label: "Flags", badge: adminCounts?.pendingFlags ?? undefined },
    { key: "verifications", label: "Verifications", badge: adminCounts?.pendingVerifications ?? undefined },
  ];
  const editorAllowedTabs: AdminTab[] = ["questions", "all-questions"];
  const tabs = isEditorOnly
    ? allTabs.filter(t => editorAllowedTabs.includes(t.key))
    : allTabs;
  const effectiveTab = isEditorOnly && !editorAllowedTabs.includes(tab) ? "questions" : tab;

  const flagItems = flagsData?.items ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Edit Modal */}
      <AnimatePresence>
        {editingQuestion && (
          <EditQuestionModal
            question={editingQuestion}
            onClose={() => setEditingQuestion(null)}
            onSaved={(updated) => {
              // Update the edited question in-place in both lists — no scroll reset, no reload
              const patchQ = (q: any) => q.id === updated.id ? { ...q, ...updated, category: updated.categories?.[0] ?? q.category } : q;
              setPendingQuestions(prev => prev.map(patchQ));
              setAllQuestions(prev => prev.map(patchQ));
            }}
          />
        )}
      </AnimatePresence>

      {/* Reject Question Modal */}
      <AnimatePresence>
        {rejectModalId !== null && (
          <RejectQuestionModal
            reason={rejectReason}
            onReasonChange={setRejectReason}
            onConfirm={confirmRejectQuestion}
            onClose={() => setRejectModalId(null)}
            isPending={rejectQuestion.isPending}
          />
        )}
      </AnimatePresence>

      {/* User Profile Modal — global so any tab can open it */}
      <AnimatePresence>
        {selectedUser && <UserProfileModal user={selectedUser} getToken={getToken} onClose={() => setSelectedUser(null)} />}
      </AnimatePresence>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isEditorOnly ? "Moderation Panel" : "Admin Panel"}</h1>
          <p className="text-sm text-muted-foreground">{isEditorOnly ? "Question moderation" : "Platform management"}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-8 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setAdminSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              effectiveTab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold gold-gradient text-white">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search bar — shown only on searchable tabs */}
      {(effectiveTab === "all-questions" || effectiveTab === "users") && (
        <div className="relative mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={adminSearch}
            onChange={e => setAdminSearch(e.target.value)}
            placeholder={effectiveTab === "all-questions" ? "Search by title or description…" : "Search by name or email…"}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
        </div>
      )}

      {/* Pending Questions */}
      {effectiveTab === "questions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">{pendingQTotal > 0 ? `${pendingQuestions.length} / ${pendingQTotal} pending` : pendingQuestions.length > 0 ? `${pendingQuestions.length} pending` : ""}</span>
            <button onClick={() => { setPendingQuestions([]); setPendingQPage(1); setPendingQLoaded(false); setPendingQError(null); }} disabled={pendingQLoading} className="text-xs text-amber-600 hover:underline disabled:opacity-40">Refresh</button>
          </div>
          {pendingQLoading && pendingQuestions.length === 0 ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : pendingQError && pendingQuestions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center">
              <p className="font-medium text-foreground mb-1">{pendingQError}</p>
              <p className="text-sm text-muted-foreground mb-4">Could not load pending questions.</p>
              <button onClick={() => { setPendingQLoaded(false); setPendingQError(null); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Retry</button>
            </div>
          ) : pendingQuestions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-30">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <p className="font-medium">No pending questions</p>
              <p className="text-sm mt-1">All questions have been reviewed</p>
            </div>
          ) : (
            <>
              <AnimatePresence initial={false}>
                {pendingQuestions.map(q => (
                  <motion.div
                    key={q.id}
                    layout
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: "hidden" }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    style={{ marginBottom: 16 }}
                  >
                    <QuestionRow
                      q={q} showApproveReject
                      onEdit={handleEdit} onToggleProfile={handleToggleProfile}
                      onFeature={handleFeatureQuestion}
                      onApprove={handleApproveQuestion} onReject={handleRejectQuestion}
                      onDelete={handleDeleteQuestion} onArchiveDuplicate={handleArchiveDuplicate}
                      isProcessing={processingIds.has(q.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={pendingQSentinelRef} className="h-1" />
              {pendingQLoading && pendingQuestions.length > 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
              )}
            </>
          )}
        </div>
      )}

      {/* All Questions */}
      {effectiveTab === "all-questions" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">{allQTotal > 0 ? `${allQuestions.length} / ${allQTotal} shown` : ""}</span>
            <button onClick={() => { setAllQuestions([]); setAllQPage(1); setAllQLoaded(false); }} disabled={allQLoading} className="text-xs text-amber-600 hover:underline disabled:opacity-40">Refresh</button>
          </div>
          {allQLoading && allQuestions.length === 0 ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : allQError && allQuestions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center">
              <p className="font-medium text-foreground mb-1">{allQError}</p>
              <p className="text-sm text-muted-foreground mb-4">Could not load questions.</p>
              <button onClick={() => { setAllQLoaded(false); setAllQError(null); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Retry</button>
            </div>
          ) : filteredQuestions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground">
              {searchTerm ? `No questions match "${adminSearch}"` : "No questions found"}
            </div>
          ) : (
            <>
              {filteredQuestions.map(q => (
                <QuestionRow
                  key={q.id} q={q} showApproveReject={q.status === "pending"}
                  onEdit={handleEdit} onToggleProfile={handleToggleProfile}
                  onFeature={handleFeatureQuestion}
                  onApprove={handleApproveQuestion} onReject={handleRejectQuestion}
                  onDelete={handleDeleteQuestion} onArchiveDuplicate={handleArchiveDuplicate}
                  isProcessing={processingIds.has(q.id)}
                />
              ))}
              <div ref={allQSentinelRef} className="h-1" />
              {allQLoading && allQuestions.length > 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Withdrawals */}
      {effectiveTab === "withdrawals" && (
        <div className="space-y-3">
          {transferMsg && (
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
              transferMsg.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-amber-50 border border-amber-200 text-amber-700"
            }`}>
              <span>{transferMsg.type === "success" ? "✓" : "⚠"} {transferMsg.text}</span>
              <button onClick={() => setTransferMsg(null)} className="opacity-60 hover:opacity-100 text-base leading-none shrink-0">✕</button>
            </div>
          )}
          {/* Status filter + count */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
              {(["", "pending", "approved", "completed"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setWithdrawalStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${withdrawalStatus === s ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {s === "" ? "All" : s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{withdrawalsTotal > 0 ? `${withdrawals.length} / ${withdrawalsTotal} shown` : ""}</span>
              <button onClick={() => { setWithdrawals([]); setWithdrawalsPage(1); setWithdrawalsLoaded(false); setWithdrawalsError(null); }} disabled={withdrawalsLoading} className="text-xs text-amber-600 hover:underline disabled:opacity-40">Refresh</button>
            </div>
          </div>
          {withdrawalsLoading && withdrawals.length === 0 ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : withdrawalsError && withdrawals.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center">
              <p className="font-medium text-foreground mb-1">{withdrawalsError}</p>
              <p className="text-sm text-muted-foreground mb-4">Could not load withdrawals.</p>
              <button onClick={() => { setWithdrawalsLoaded(false); setWithdrawalsError(null); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Retry</button>
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground">No withdrawal requests</div>
          ) : (
            <>
              {withdrawals.map((tx: any, i: number) => {
              // Parse method + details from description: "Withdrawal via METHOD — DETAILS"
              const descMatch = (tx.description || "").match(/^Withdrawal via (.+?) — (.+)$/);
              const parsedMethod = descMatch ? descMatch[1] : null;
              const parsedDetails = descMatch ? descMatch[2] : tx.description;
              // O(1) lookup via pre-built map
              const fullUser = usersMap[tx.userClerkId || tx.userId];
              return (
                <motion.div key={tx.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className="bg-card border border-card-border rounded-xl px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: user + details */}
                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Clickable user name */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {tx.userName ? (
                          <button
                            type="button"
                            onClick={() => fullUser && setSelectedUser(fullUser)}
                            className={`font-semibold text-sm ${fullUser ? "text-amber-700 hover:underline cursor-pointer" : "text-foreground cursor-default"}`}
                          >
                            {tx.userName}
                          </button>
                        ) : (
                          <span className="text-sm text-muted-foreground">{tx.userId.substring(0, 16)}…</span>
                        )}
                        {tx.userEmail && (
                          <span className="text-xs text-muted-foreground">· {tx.userEmail}</span>
                        )}
                      </div>
                      {/* Method + details */}
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/70">{parsedMethod ?? "Withdrawal"}</span>
                        {parsedDetails && !((tx as any).meta?.usdtAddress) && <span> · {parsedDetails}</span>}
                      </div>
                      {/* USDT-specific fields (from meta) */}
                      {(tx as any).meta?.usdtAddress ? (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Network: <span className="font-medium text-foreground">{(tx as any).meta.usdtNetwork}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Wallet Address: <span className="font-medium text-foreground font-mono">{(tx as any).meta.usdtAddress}</span>
                          </div>
                          {(tx as any).meta.usdtOwnerName && (
                            <div className="text-xs text-muted-foreground">
                              Owner Name: <span className="font-medium text-foreground">{(tx as any).meta.usdtOwnerName}</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* Account title (bank transfer) */}
                          {tx.accountTitle && (
                            <div className="text-xs text-muted-foreground">
                              Account title: <span className="font-medium text-foreground">{tx.accountTitle}</span>
                            </div>
                          )}
                          {/* Bank / Wallet Name (bank transfer) */}
                          {(tx as any).bankName && (
                            <div className="text-xs text-muted-foreground">
                              Bank / Wallet: <span className="font-medium text-foreground">{(tx as any).bankName}</span>
                            </div>
                          )}
                        </>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {/* Right: amount + status + actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-red-500">${(Math.abs(tx.amountCents) / 100).toFixed(2)}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          tx.status === "pending" ? "bg-amber-100 text-amber-700" :
                          tx.status === "approved" || tx.status === "completed" ? "bg-blue-100 text-blue-700" :
                          tx.status === "transferred" ? "bg-green-100 text-green-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {tx.status === "completed" ? "approved" : tx.status}
                        </span>
                      </div>
                      {/* Dates */}
                      {tx.approvedAt && (
                        <div className="text-xs text-muted-foreground">
                          Approved: {new Date(tx.approvedAt).toLocaleDateString()}
                        </div>
                      )}
                      {tx.transferredAt && (
                        <div className="text-xs text-green-600 font-medium">
                          Transferred: {new Date(tx.transferredAt).toLocaleDateString()}
                        </div>
                      )}
                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        {tx.status === "pending" && (
                          <>
                            <button
                              onClick={() => approveWithdrawal.mutate({ id: tx.id }, { onSuccess: () => updateWithdrawalStatus(tx.id, "approved") })}
                              disabled={approveWithdrawal.isPending}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectWithdrawalMutation.mutate({ id: tx.id }, { onSuccess: () => updateWithdrawalStatus(tx.id, "rejected") })}
                              disabled={rejectWithdrawalMutation.isPending}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
                            >
                              {rejectWithdrawalMutation.isPending ? "..." : "Reject"}
                            </button>
                          </>
                        )}
                        {(tx.status === "approved" || tx.status === "completed") && (
                          <button
                            onClick={() => transferWithdrawalMutation.mutate({ id: tx.id }, {
                              onSuccess: (data: any) => {
                                updateWithdrawalStatus(tx.id, "transferred");
                                setTransferMsg(
                                  data?.emailSent
                                    ? { type: "success", text: "Withdrawal marked as paid and payment email sent." }
                                    : { type: "warn", text: "Withdrawal marked as paid, but email could not be sent." }
                                );
                                setTimeout(() => setTransferMsg(null), 8000);
                              },
                            })}
                            disabled={transferWithdrawalMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-40"
                          >
                            {transferWithdrawalMutation.isPending ? "..." : "Transfer"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
              })}
              <div ref={withdrawalsSentinelRef} className="h-1" />
              {withdrawalsLoading && withdrawals.length > 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Users */}
      {effectiveTab === "users" && (
        <div>
          <AnimatePresence>
            {userQuestionsUser && <UserQuestionsModal user={userQuestionsUser} questions={allQuestions} onClose={() => setUserQuestionsUser(null)} />}
            {userAnswersUser && <UserAnswersModal user={userAnswersUser} getToken={getToken} onClose={() => setUserAnswersUser(null)} />}
            {banModalUser && (
              <BanUserModal
                user={banModalUser}
                reason={banReason}
                onReasonChange={setBanReason}
                banIp={banIp}
                onBanIpChange={setBanIp}
                onConfirm={() => handleBanUser(banModalUser.clerkId, banReason, banIp)}
                onClose={() => { setBanModalUser(null); setBanReason(""); setBanIp(false); }}
                isPending={banToggling === banModalUser?.clerkId}
              />
            )}
          </AnimatePresence>
          <div className="flex justify-end mb-3">
            <select
              value={userSort}
              onChange={e => setUserSort(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="earnings-desc">Highest Earnings</option>
              <option value="earnings-asc">Lowest Earnings</option>
              <option value="balance-desc">Highest Balance</option>
              <option value="answers-desc">Most Answers</option>
              <option value="answers-asc">Least Answers</option>
              <option value="questions-desc">Most Questions Created</option>
              <option value="questions-asc">Least Questions Created</option>
              <option value="banned">Banned Only</option>
              <option value="verified">Verified Only</option>
            </select>
          </div>

          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">{usersTotal > 0 ? `${users.length} / ${usersTotal} shown` : ""}</span>
            <button onClick={() => { setUsers([]); setUsersPage(1); setUsersLoaded(false); setUsersError(null); }} disabled={usersLoading} className="text-xs text-amber-600 hover:underline disabled:opacity-40">Refresh</button>
          </div>
          {usersLoading && users.length === 0 ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : usersError && users.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center">
              <p className="font-medium text-foreground mb-1">{usersError}</p>
              <p className="text-sm text-muted-foreground mb-4">Could not load users.</p>
              <button onClick={() => { setUsersLoaded(false); setUsersError(null); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Retry</button>
            </div>
          ) : (
          <>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">User</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Questions</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden md:table-cell">Answers</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden md:table-cell">Earnings</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Joined</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden lg:table-cell">Last IP</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Role / Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                      {searchTerm ? `No users match "${adminSearch}"` : "No users found"}
                    </td>
                  </tr>
                ) : null}
                {users.map((u: any, i: number) => (
                  <tr key={u.id} className={`${i % 2 === 0 ? "bg-card" : "bg-muted/30"} ${u.isBanned ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="font-medium text-foreground hover:text-amber-600 transition-colors text-left"
                      >
                        {u.name || "—"}
                      </button>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                      {u.isBanned && (
                        <div className="text-[10px] text-red-500 font-medium mt-0.5">Banned{u.bannedReason ? `: ${u.bannedReason}` : ""}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <button
                        onClick={() => setUserQuestionsUser(u)}
                        className="font-medium text-amber-600 hover:underline"
                      >
                        {(u as any).questionCount ?? 0}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <button
                        onClick={() => setUserAnswersUser(u)}
                        className="font-medium text-amber-600 hover:underline"
                      >
                        {(u as any).answerCount ?? 0}
                      </button>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground hidden md:table-cell">
                      {formatCents((u as any).earningsCents ?? 0)}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      {u.lastIp
                        ? <span className="text-xs font-mono text-muted-foreground">{u.lastIp}</span>
                        : <span className="text-xs text-muted-foreground/40">—</span>
                      }
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col items-start gap-1">
                        {u.isAdmin
                          ? <span className="text-xs font-bold px-2 py-0.5 rounded-full gold-gradient text-white">Admin</span>
                          : u.isBanned
                            ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Banned</span>
                            : u.isEditor
                              ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Editor</span>
                              : <span className="text-xs text-muted-foreground">User</span>
                        }
                        {!u.isAdmin && (
                          <>
                            <button
                              onClick={() => handleToggleEditor(u.clerkId)}
                              disabled={editorToggling === u.clerkId || banToggling === u.clerkId}
                              className="text-[10px] text-muted-foreground hover:text-violet-700 underline underline-offset-2 transition-colors disabled:opacity-40"
                            >
                              {editorToggling === u.clerkId ? "…" : u.isEditor ? "Remove Editor" : "Make Editor"}
                            </button>
                            {u.isBanned ? (
                              <button
                                onClick={() => handleUnbanUser(u.clerkId)}
                                disabled={banToggling === u.clerkId}
                                className="text-[10px] text-green-700 hover:text-green-800 underline underline-offset-2 transition-colors disabled:opacity-40"
                              >
                                {banToggling === u.clerkId ? "…" : "Unban"}
                              </button>
                            ) : (
                              <button
                                onClick={() => { setBanModalUser(u); setBanReason(""); setBanIp(false); }}
                                disabled={banToggling === u.clerkId}
                                className="text-[10px] text-red-600 hover:text-red-700 underline underline-offset-2 transition-colors disabled:opacity-40"
                              >
                                {banToggling === u.clerkId ? "…" : "Ban"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <div className="p-10 text-center text-muted-foreground">No users found</div>}
          </div>
          <div ref={usersSentinelRef} className="h-1 mt-3" />
          {usersLoading && users.length > 0 && (
            <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
          )}
          </>
          )}
        </div>
      )}


      {/* Stats */}
      {effectiveTab === "stats" && (
        <div className="space-y-8">
          {/* Summary cards */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Users", value: stats.totalUsers },
                { label: "Total Questions", value: stats.totalQuestions },
                { label: "Pending Questions", value: stats.pendingQuestions },
                { label: "Total Answers", value: stats.totalAnswers },
                { label: "Total Earned", value: formatCents(stats.totalEarnedCents) },
                { label: "Withdrawn", value: formatCents(stats.totalWithdrawnCents) },
                { label: "Pending Withdrawals", value: formatCents(stats.pendingWithdrawalCents) },
                { label: "Active This Week", value: stats.activeUsersThisWeek },
              ].map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
                  className="bg-card border border-card-border rounded-xl p-5 shadow-sm text-center"
                >
                  <div className="text-2xl font-bold text-amber-600">{stat.value}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-medium">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Growth charts */}
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <h2 className="text-base font-semibold text-foreground">Growth Over Time</h2>
              <div className="flex gap-1.5">
                {[
                  { key: "7", label: "7d" },
                  { key: "30", label: "30d" },
                  { key: "90", label: "90d" },
                  { key: "all", label: "All" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setGrowthRange(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      growthRange === key
                        ? "gold-gradient text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {growthLoading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading charts...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    title: "New Users",
                    color: "#f59e0b",
                    data: (growthData?.users ?? []).map((p: any) => ({
                      date: p.date,
                      value: Number(p.count ?? 0),
                    })),
                    valueLabel: "users",
                    format: (v: number) => String(v),
                  },
                  {
                    title: "New Questions",
                    color: "#8b5cf6",
                    data: (growthData?.questions ?? []).map((p: any) => ({
                      date: p.date,
                      value: Number(p.count ?? 0),
                    })),
                    valueLabel: "questions",
                    format: (v: number) => String(v),
                  },
                  {
                    title: "Answers Given",
                    color: "#10b981",
                    data: (growthData?.answers ?? []).map((p: any) => ({
                      date: p.date,
                      value: Number(p.count ?? 0),
                    })),
                    valueLabel: "answers",
                    format: (v: number) => String(v),
                  },
                  {
                    title: "Daily Earnings",
                    color: "#f59e0b",
                    data: (growthData?.earnings ?? []).map((p: any) => ({
                      date: p.date,
                      value: Number(p.total ?? 0),
                    })),
                    valueLabel: "¢ earned",
                    format: (v: number) => `${v.toFixed(0)}¢`,
                  },
                ].map(({ title, color, data, valueLabel, format }) => (
                  <div key={title}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      <p className="text-xs text-muted-foreground">
                        Total: {format(data.reduce((s: number, d: any) => s + d.value, 0))}
                      </p>
                    </div>
                    {data.length === 0 ? (
                      <div className="h-36 flex items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">
                        No data for this period
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                              <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(d: string) => {
                              const dt = new Date(d + "T00:00:00");
                              return `${dt.getMonth() + 1}/${dt.getDate()}`;
                            }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            tickFormatter={format}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              fontSize: "12px",
                              color: "var(--foreground)",
                            }}
                            formatter={(v: number) => [format(v), valueLabel]}
                            labelFormatter={(l: string) => new Date(l + "T00:00:00").toLocaleDateString()}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            strokeWidth={2}
                            fill={`url(#grad-${title})`}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Earnings Analytics ─────────────────────────────────────── */}
          <div className="bg-card border border-card-border rounded-2xl p-6 shadow-sm space-y-6">
            {/* Header + range selector */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Earnings Analytics</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Full breakdown of platform earnings, spending, and wallet data</p>
              </div>
              <div className="flex gap-1.5">
                {[
                  { key: "7",   label: "7d" },
                  { key: "30",  label: "30d" },
                  { key: "90",  label: "90d" },
                  { key: "all", label: "All" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setEarningsRange(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      earningsRange === key
                        ? "gold-gradient text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {earningsLoading ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading analytics…</div>
            ) : earningsData ? (
              <>
                {/* ── Total distributed summary ── */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Total Distributed</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Answer Earnings",    value: earningsData.answerEarningsCents,    color: "text-amber-500" },
                      { label: "Creator Rewards",    value: earningsData.creatorRewardCents,    color: "text-purple-500" },
                      { label: "Referral Signup",    value: earningsData.referralSignupCents,   color: "text-emerald-500" },
                      { label: "Referral Answers",   value: earningsData.referralAnswerCents,   color: "text-blue-500" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-muted/40 rounded-xl p-4 text-center border border-border">
                        <div className={`text-xl font-bold ${color}`}>${(value / 100).toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground mt-1 font-medium">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-center">
                      <div className="text-xl font-bold text-amber-600">${(earningsData.totalDistributedCents / 100).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">Total Distributed</div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center">
                      <div className="text-xl font-bold text-red-500">${(earningsData.questionPurchaseSpendingCents / 100).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">Question Purchase Spend ({earningsData.questionPurchaseCount})</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center col-span-2 sm:col-span-1">
                      <div className="text-xl font-bold text-green-600">${(earningsData.totalWithdrawnCents / 100).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">Total Withdrawn ({earningsData.completedWithdrawalCount} txns)</div>
                    </div>
                  </div>
                </div>

                {/* ── Charts row ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Earnings source pie */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Earnings Source Breakdown</p>
                    {earningsData.earningsSourceBreakdown.length === 0 ? (
                      <div className="h-48 flex items-center justify-center rounded-xl bg-muted/40 text-xs text-muted-foreground">No earnings data for this period</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={earningsData.earningsSourceBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                          >
                            {earningsData.earningsSourceBreakdown.map((_, i) => (
                              <Cell
                                key={i}
                                fill={["#f59e0b","#8b5cf6","#10b981","#3b82f6","#f43f5e"][i % 5]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px", color: "var(--foreground)" }}
                            formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, ""]}
                          />
                          <Legend
                            iconSize={10}
                            wrapperStyle={{ fontSize: "11px" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Wallet range bar */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Wallet Balance Distribution</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={earningsData.walletRangeDistribution} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px", color: "var(--foreground)" }}
                          formatter={(v: number) => [v, "users"]}
                        />
                        <Bar dataKey="count" name="Users" radius={[4,4,0,0]}>
                          {earningsData.walletRangeDistribution.map((_, i) => (
                            <Cell key={i} fill={["#94a3b8","#3b82f6","#8b5cf6","#f59e0b","#10b981"][i % 5]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ── Earner breakdown ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Answer analytics */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">Answer Analytics</p>
                    {[
                      { label: "Total Answers",      value: earningsData.totalAnswerCount.toLocaleString() },
                      { label: "Unique Earners",      value: earningsData.answerEarnerCount.toLocaleString() },
                      { label: "Avg per Earner",      value: `$${(earningsData.avgAnswerEarningsPerUser / 100).toFixed(3)}` },
                      { label: "Avg Answers / Earner",value: earningsData.avgAnswersPerEarner.toFixed(1) },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Creator analytics */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 mb-2">Creator Rewards</p>
                    {[
                      { label: "Total Paid",          value: `$${(earningsData.creatorRewardCents / 100).toFixed(2)}` },
                      { label: "Unique Creators",     value: earningsData.creatorEarnerCount.toLocaleString() },
                      { label: "Avg per Creator",     value: `$${(earningsData.avgCreatorEarningsPerUser / 100).toFixed(3)}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Referral analytics */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-2">Referral Analytics</p>
                    {[
                      { label: "Total Referral Paid", value: `$${((earningsData.referralSignupCents + earningsData.referralAnswerCents) / 100).toFixed(2)}` },
                      { label: "Unique Earners",       value: earningsData.referralEarnerCount.toLocaleString() },
                      { label: "Signup Bonus Users",   value: earningsData.referralSignupEarners.toLocaleString() },
                      { label: "Answer Bonus Users",   value: earningsData.referralAnswerEarners.toLocaleString() },
                      { label: "Avg per Earner",       value: `$${(earningsData.avgReferralEarningsPerEarner / 100).toFixed(3)}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Wallet & withdrawal summary ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Wallet Balance",    value: `$${(earningsData.totalWalletBalanceCents / 100).toFixed(2)}`,    color: "text-foreground" },
                    { label: "Withdrawable (≥$10)",     value: `$${(earningsData.withdrawableBalanceCents / 100).toFixed(2)}`,   color: "text-green-600" },
                    { label: "Locked (below $10)",      value: `$${(earningsData.nonWithdrawableBalanceCents / 100).toFixed(2)}`,color: "text-orange-500" },
                    { label: "Pending Withdrawals",     value: `$${(earningsData.pendingWithdrawalCents / 100).toFixed(2)} (${earningsData.pendingWithdrawalCount})`, color: "text-blue-500" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-muted/40 rounded-xl p-4 text-center border border-border">
                      <div className={`text-lg font-bold ${color}`}>{value}</div>
                      <div className="text-xs text-muted-foreground mt-1 font-medium">{label}</div>
                    </div>
                  ))}
                </div>

                {/* ── Top earners ── */}
                {earningsData.topEarners.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Top 20 Earners (All Time)</p>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border">
                            <th className="p-3 text-left font-semibold text-muted-foreground">#</th>
                            <th className="p-3 text-left font-semibold text-muted-foreground">User</th>
                            <th className="p-3 text-right font-semibold text-muted-foreground">Total Earned</th>
                            <th className="p-3 text-right font-semibold text-muted-foreground">Answers</th>
                            <th className="p-3 text-right font-semibold text-muted-foreground">Creator</th>
                            <th className="p-3 text-right font-semibold text-muted-foreground">Referral</th>
                            <th className="p-3 text-right font-semibold text-muted-foreground">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {earningsData.topEarners.map((earner, i) => (
                            <tr key={earner.userId} className={`border-b border-border last:border-0 ${i % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                              <td className="p-3 text-muted-foreground font-medium">{i + 1}</td>
                              <td className="p-3">
                                <div className="font-medium text-foreground truncate max-w-[120px]">{earner.name}</div>
                                <div className="text-muted-foreground truncate max-w-[120px]">{earner.email}</div>
                              </td>
                              <td className="p-3 text-right font-bold text-amber-600">${(earner.totalEarnedCents / 100).toFixed(2)}</td>
                              <td className="p-3 text-right text-muted-foreground">${(earner.answerCents / 100).toFixed(2)}</td>
                              <td className="p-3 text-right text-purple-600">${(earner.creatorCents / 100).toFixed(2)}</td>
                              <td className="p-3 text-right text-emerald-600">${(earner.referralCents / 100).toFixed(2)}</td>
                              <td className="p-3 text-right">
                                <span className={`font-semibold ${earner.isWithdrawable ? "text-green-600" : "text-foreground"}`}>
                                  ${(earner.balanceCents / 100).toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Referrals */}
      {effectiveTab === "referrals" && (
        <div className="space-y-6">
          {/* Stats row */}
          {refStatsData && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { label: "Total Referrals", value: refStatsData.totalReferrals },
                { label: "Approved", value: refStatsData.approvedCount },
                { label: "Flagged", value: refStatsData.flaggedCount },
                { label: "Rejected", value: refStatsData.rejectedCount },
                { label: "Total Paid", value: formatCents(refStatsData.totalPaidCents) },
              ].map(s => (
                <div key={s.label} className="bg-card border border-card-border rounded-xl p-4 text-center shadow-sm">
                  <div className="text-2xl font-bold text-amber-600">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Referral list */}
          <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-semibold text-foreground">All Referrals</h2>
              <button onClick={refetchReferrals} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Refresh</button>
            </div>
            {refListLoading && referralList.length === 0 ? (
              <div className="space-y-3 p-6">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : refListError && referralList.length === 0 ? (
              <div className="text-center py-12 px-6">
                <p className="font-medium text-foreground mb-1">{refListError}</p>
                <p className="text-sm text-muted-foreground mb-4">Could not load referrals.</p>
                <button onClick={() => { setReferralList([]); setRefListPage(1); setRefListLoaded(false); setRefListError(null); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Retry</button>
              </div>
            ) : referralList.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-12">No referrals yet.</div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-5 py-3 font-semibold">Referrer</th>
                      <th className="text-left px-5 py-3 font-semibold">Referred</th>
                      <th className="text-left px-5 py-3 font-semibold hidden sm:table-cell">Signup Bonus</th>
                      <th className="text-left px-5 py-3 font-semibold hidden md:table-cell">Answer Bonus</th>
                      <th className="text-left px-5 py-3 font-semibold">Status</th>
                      <th className="text-left px-5 py-3 font-semibold hidden lg:table-cell">Flags</th>
                      <th className="text-left px-5 py-3 font-semibold">Date</th>
                      <th className="text-right px-5 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referralList.map(r => (
                      <tr key={r.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-foreground">{r.referrerName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.referrerEmail}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-foreground">{r.referredName || "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.referredEmail}</div>
                        </td>
                        <td className="px-5 py-3.5 hidden sm:table-cell text-muted-foreground">
                          {r.signupBonusCents.toFixed(1)}¢
                        </td>
                        <td className="px-5 py-3.5 hidden md:table-cell text-muted-foreground">
                          {r.answerBonusCentsTotal.toFixed(2)}¢
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            r.status === "approved" ? "bg-emerald-100 text-emerald-700"
                            : r.status === "flagged" ? "bg-orange-100 text-orange-700"
                            : r.status === "rejected" ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell">
                          {r.fraudFlags && r.fraudFlags.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {r.fraudFlags.map((f: string) => (
                                <span key={f} className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-xs">{f}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground text-xs">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            {r.status !== "approved" && (
                              <button
                                onClick={() => patchRefStatus.mutate({ id: r.id, data: { status: "approved" } }, { onSuccess: refetchReferrals })}
                                className="px-2.5 py-1 rounded-lg text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors font-medium"
                              >
                                Approve
                              </button>
                            )}
                            {r.status !== "flagged" && (
                              <button
                                onClick={() => patchRefStatus.mutate({ id: r.id, data: { status: "flagged" } }, { onSuccess: refetchReferrals })}
                                className="px-2.5 py-1 rounded-lg text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors font-medium"
                              >
                                Flag
                              </button>
                            )}
                            {r.status !== "rejected" && (
                              <button
                                onClick={() => {
                                  if (confirm("Reverse this referral and reclaim all bonuses?")) {
                                    reverseRef.mutate({ id: r.id }, { onSuccess: refetchReferrals });
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs bg-red-100 text-red-700 hover:bg-red-200 transition-colors font-medium"
                              >
                                Reverse
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div ref={refListSentinelRef} className="h-1" />
              {refListLoading && referralList.length > 0 && (
                <div className="px-6 py-3 border-t border-border text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
              )}
              </>
            )}
          </div>

        {/* Per-Referrer Analytics */}
        <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">By Referrer</h2>
            <button
              onClick={fetchByUser}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Refresh
            </button>
          </div>
          {byUserLoading ? (
            <div className="space-y-3 p-6">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : !byUserData || byUserData.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-12">
              No referrers yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {byUserData.map(referrer => (
                <div key={referrer.referrerId}>
                  {/* Referrer row */}
                  <button
                    className="w-full text-left px-5 py-4 hover:bg-muted/20 transition-colors flex items-center gap-4"
                    onClick={() => setExpandedReferrer(
                      expandedReferrer === referrer.referrerId ? null : referrer.referrerId
                    )}
                  >
                    {/* Chevron */}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5"
                      className={`shrink-0 text-muted-foreground transition-transform ${
                        expandedReferrer === referrer.referrerId ? "rotate-90" : ""
                      }`}
                    >
                      <path d="m9 18 6-6-6-6"/>
                    </svg>

                    {/* Name / email */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground text-sm truncate">
                        {referrer.referrerName}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {referrer.referrerEmail}
                      </div>
                    </div>

                    {/* Stats pills */}
                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      <span className="text-muted-foreground">
                        <span className="font-semibold text-foreground">{referrer.totalReferred}</span> invited
                        {referrer.totalReferred !== referrer.activeReferred && (
                          <span className="text-red-400 ml-1">({referrer.totalReferred - referrer.activeReferred} reversed)</span>
                        )}
                      </span>
                      <span className="text-muted-foreground hidden sm:block">
                        Signup: <span className="font-semibold text-foreground">{referrer.totalSignupBonus.toFixed(1)}¢</span>
                      </span>
                      <span className="text-muted-foreground hidden md:block">
                        Answers: <span className="font-semibold text-foreground">{referrer.totalAnswerBonus.toFixed(2)}¢</span>
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold">
                        Total: {referrer.totalReferralIncome.toFixed(2)}¢
                      </span>
                    </div>
                  </button>

                  {/* Expanded referred users */}
                  {expandedReferrer === referrer.referrerId && (
                    <div className="bg-muted/30 border-t border-border">
                      {referrer.referrals.length === 0 ? (
                        <div className="px-10 py-4 text-xs text-muted-foreground">No referred users.</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground border-b border-border">
                              <th className="text-left px-10 py-2 font-semibold">Referred User</th>
                              <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Signup Bonus</th>
                              <th className="text-left px-4 py-2 font-semibold hidden sm:table-cell">Answer Bonus</th>
                              <th className="text-left px-4 py-2 font-semibold">Status</th>
                              <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {referrer.referrals.map((r: any) => (
                              <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                <td className="px-10 py-2.5">
                                  <div className="font-medium text-foreground">{r.referredName}</div>
                                  <div className="text-muted-foreground">{r.referredEmail}</div>
                                </td>
                                <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
                                  {r.signupBonusCents.toFixed(1)}¢
                                </td>
                                <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">
                                  {r.answerBonusCentsTotal.toFixed(2)}¢
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                                    r.status === "approved" ? "bg-emerald-100 text-emerald-700"
                                    : r.status === "flagged" ? "bg-orange-100 text-orange-700"
                                    : r.status === "rejected" ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {r.status}
                                  </span>
                                  {r.fraudFlags && r.fraudFlags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {r.fraudFlags.map((f: string) => (
                                        <span key={f} className="px-1 bg-red-50 text-red-500 rounded">{f}</span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">
                                  {new Date(r.createdAt).toLocaleDateString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Flags Tab ─────────────────────────────────────────────────────────── */}
      {effectiveTab === "flags" && (
        <div>
          {/* Summary stat cards — clicking filters the list */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {([
              { label: "Pending", value: flagsData?.pending ?? 0, color: "text-amber-600 bg-amber-50 border-amber-200", filter: "pending" as const },
              { label: "Resolved", value: flagsData?.resolved ?? 0, color: "text-green-600 bg-green-50 border-green-200", filter: "resolved" as const },
              { label: "Removed", value: flagsData?.removed ?? 0, color: "text-red-600 bg-red-50 border-red-200", filter: "removed" as const },
            ]).map(stat => (
              <button
                key={stat.label}
                onClick={() => { setFlagFilter(stat.filter); setSelectedFlagIds(new Set()); }}
                className={`border rounded-2xl p-4 text-center transition-all cursor-pointer ${stat.color} ${flagFilter === stat.filter ? "ring-2 ring-offset-1 ring-current shadow-sm" : "opacity-70 hover:opacity-100"}`}
              >
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm font-medium mt-0.5">{stat.label}</p>
              </button>
            ))}
          </div>

          {/* Notification banner */}
          {flagNotification && (
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl mb-4 text-sm font-medium ${flagNotification.type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <span>{flagNotification.type === "success" ? "✓" : "✗"} {flagNotification.msg}</span>
              <button onClick={() => setFlagNotification(null)} className="opacity-60 hover:opacity-100 text-base leading-none shrink-0">✕</button>
            </div>
          )}

          {/* Filter tabs + sort */}
          {!flagsLoading && flagsData && (
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
                {(["all", "pending", "resolved", "removed"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setFlagFilter(f); setSelectedFlagIds(new Set()); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${flagFilter === f ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {f}
                    <span className="ml-1 opacity-60">
                      ({f === "all" ? (flagsData.pending + flagsData.resolved + flagsData.removed) : f === "pending" ? flagsData.pending : f === "resolved" ? flagsData.resolved : flagsData.removed})
                    </span>
                  </button>
                ))}
              </div>
              <select
                value={flagSort}
                onChange={e => setFlagSort(e.target.value as "newest" | "oldest" | "most-flagged")}
                className="text-xs border border-border rounded-lg px-3 py-2 bg-card text-foreground font-medium focus:outline-none cursor-pointer"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="most-flagged">Most flagged</option>
              </select>
            </div>
          )}

          {/* Sticky bulk action bar — appears when items are selected */}
          {selectedFlagIds.size > 0 && (
            <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 mb-4 bg-[#1e3a5f] text-white rounded-2xl shadow-xl">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">{selectedFlagIds.size} selected</span>
                <button
                  onClick={() => setSelectedFlagIds(new Set())}
                  className="text-xs text-white/70 hover:text-white underline"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkModal("clear")}
                  disabled={bulkLoading}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-green-500 hover:bg-green-400 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  {bulkLoading ? <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> : null}
                  Clear Flags ({selectedFlagIds.size})
                </button>
                <button
                  onClick={() => setBulkModal("remove")}
                  disabled={bulkLoading}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-400 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5"
                >
                  Remove Answers ({selectedFlagIds.size})
                </button>
              </div>
            </div>
          )}

          {flagsLoading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Loading flags…
            </div>
          ) : flagsError ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="font-medium text-foreground">{flagsError}</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">The flags list could not be loaded.</p>
              <button onClick={() => { void fetchFlags(); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">
                Retry
              </button>
            </div>
          ) : !flagsData || flagItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-4xl mb-3">🎉</div>
              <p className="font-medium">No {flagFilter === "all" ? "flagged" : flagFilter} answers found</p>
              <p className="text-sm mt-1">{flagFilter === "all" ? "All answers are in good standing" : "Try a different filter above"}</p>
            </div>
          ) : (
            <div>
              {/* Select All row */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <input
                  type="checkbox"
                  id="flags-select-all"
                  checked={
                    flagItems.filter(i => i.flagStatus !== "removed").length > 0 &&
                    flagItems.filter(i => i.flagStatus !== "removed").every(i => selectedFlagIds.has(i.answerId))
                  }
                  onChange={e => {
                    const actionable = flagItems.filter(i => i.flagStatus !== "removed");
                    setSelectedFlagIds(e.target.checked ? new Set(actionable.map(i => i.answerId)) : new Set());
                  }}
                  className="w-4 h-4 rounded cursor-pointer accent-[#1e3a5f]"
                />
                <label htmlFor="flags-select-all" className="text-xs text-muted-foreground font-medium cursor-pointer select-none">
                  Select all ({flagItems.filter(i => i.flagStatus !== "removed").length} actionable)
                </label>
              </div>

              <div className="space-y-4">
                {flagItems.map((item: any) => (
                  <div
                    key={item.answerId}
                    className={`bg-card border rounded-2xl p-5 shadow-sm transition-all ${
                      selectedFlagIds.has(item.answerId) ? "border-[#1e3a5f] ring-1 ring-[#1e3a5f]/30" :
                      item.flagStatus === "pending" ? "border-amber-300" :
                      item.flagStatus === "removed" ? "border-red-200 opacity-60" :
                      "border-border"
                    }`}
                  >

                    {/* Card header row */}
                    <div className="flex items-start gap-3 mb-3">
                      {/* Checkbox (only for non-removed) */}
                      {item.flagStatus !== "removed" && (
                        <input
                          type="checkbox"
                          checked={selectedFlagIds.has(item.answerId)}
                          onChange={() => {
                            const next = new Set(selectedFlagIds);
                            if (next.has(item.answerId)) next.delete(item.answerId);
                            else next.add(item.answerId);
                            setSelectedFlagIds(next);
                          }}
                          className="mt-1 w-4 h-4 rounded cursor-pointer accent-[#1e3a5f] shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5 truncate">{item.questionTitle || "Unknown Question"}</p>
                        <p className="font-medium text-foreground">&ldquo;{item.answerText}&rdquo;</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          By <span className="font-semibold">{item.userName}</span> &bull; {item.flagCount} flag{item.flagCount !== 1 ? "s" : ""} &bull; Top reason: <span className="font-semibold">{item.topReason}</span>
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                        item.flagStatus === "pending" ? "bg-amber-100 text-amber-700" :
                        item.flagStatus === "removed" ? "bg-red-100 text-red-700" :
                        "bg-green-100 text-green-700"
                      }`}>
                        {item.flagStatus}
                      </span>
                    </div>

                    {/* Individual flag records */}
                    {item.flags.length > 0 && (
                      <div className="bg-muted/40 rounded-xl p-3 mb-3 space-y-1.5">
                        {item.flags.map((f: any) => (
                          <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-muted-foreground">{f.reason}</span>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.status === "pending" ? "bg-amber-100 text-amber-700" : f.status === "ignored" ? "bg-muted text-muted-foreground" : "bg-red-100 text-red-700"}`}>{f.status}</span>
                              {f.status === "pending" && (
                                <button
                                  onClick={() => handleFlagIgnore(f.id)}
                                  disabled={flagActionId === f.id || bulkLoading}
                                  className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                                >
                                  Ignore
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Single-item action buttons */}
                    {item.flagStatus !== "removed" && (
                      <div className="flex gap-2 flex-wrap">
                        {item.flagStatus === "pending" && (
                          <button
                            onClick={() => handleClearFlag(item.answerId)}
                            disabled={flagActionId === item.answerId || bulkLoading}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                          >
                            Clear Flag (keep answer)
                          </button>
                        )}
                        <button
                          onClick={() => handleFlagRemoveAnswer(item.answerId)}
                          disabled={flagActionId === item.answerId || bulkLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                        >
                          Remove Answer
                        </button>
                        <a
                          href={`/questions/${item.questionId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors"
                        >
                          View Question ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={flagsSentinelRef} className="h-1" />
                {flagsLoading && flagsData && flagsData.items.length > 0 && (
                  <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
                )}
              </div>
            </div>
          )}

          {/* ── Bulk confirmation modals ── */}
          {bulkModal && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !bulkLoading && setBulkModal(null)}>
              <div className="bg-card border border-card-border rounded-2xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
                {bulkModal === "clear" ? (
                  <>
                    <h3 className="font-bold text-lg text-foreground mb-2">Clear Flags</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Are you sure you want to clear flags for the <strong>{selectedFlagIds.size}</strong> selected answer{selectedFlagIds.size !== 1 ? "s" : ""} and keep those answers visible?
                    </p>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setBulkModal(null)} disabled={bulkLoading} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors">Cancel</button>
                      <button onClick={handleBulkClear} disabled={bulkLoading} className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                        {bulkLoading && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
                        Clear Flags
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-bold text-lg text-foreground mb-2">⚠️ Remove Answers</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Are you sure you want to remove the <strong>{selectedFlagIds.size}</strong> selected answer{selectedFlagIds.size !== 1 ? "s" : ""}?
                    </p>
                    <p className="text-sm font-semibold text-red-600 mb-6">This action may not be reversible.</p>
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => setBulkModal(null)} disabled={bulkLoading} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors">Cancel</button>
                      <button onClick={handleBulkRemove} disabled={bulkLoading} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                        {bulkLoading && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
                        Remove Answers
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Verifications Tab ─────────────────────────────────────── */}
      {effectiveTab === "verifications" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground">{verificationsTotal > 0 ? `${verificationsData?.users.length ?? 0} / ${verificationsTotal} shown` : ""}</span>
            <button onClick={() => { setVerificationsLoaded(false); setVerificationsError(null); }} disabled={verificationsLoading} className="text-xs text-amber-600 hover:underline disabled:opacity-40">Refresh</button>
          </div>
          {verificationsLoading && !verificationsData ? (
            <div className="flex items-center justify-center py-20">
              <svg className="animate-spin w-8 h-8 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </div>
          ) : verificationsError && !verificationsData ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="font-medium text-foreground mb-1">{verificationsError}</p>
              <p className="text-sm text-muted-foreground mb-4">Could not load verifications.</p>
              <button onClick={() => { setVerificationsLoaded(false); setVerificationsError(null); }} className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors">Retry</button>
            </div>
          ) : !verificationsData ? (
            <p className="text-muted-foreground text-sm text-center py-20">No data available.</p>
          ) : (
            <>
              {/* Stats strip — clickable to filter */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                {[
                  { label: "Pending", value: verificationsData.pending, color: "text-amber-600", filterKey: "pending" as const },
                  { label: "Approved", value: verificationsData.approved, color: "text-green-600", filterKey: "approved" as const },
                  { label: "Rejected", value: verificationsData.rejected, color: "text-red-600", filterKey: "rejected" as const },
                  { label: "Re-upload", value: verificationsData.reupload, color: "text-blue-600", filterKey: "reupload_requested" as const },
                ].map(s => (
                  <button
                    key={s.label}
                    onClick={() => setVerifFilter(prev => prev === s.filterKey ? "all" : s.filterKey)}
                    className={`bg-card border rounded-xl p-4 text-center shadow-sm transition-all ${verifFilter === s.filterKey ? "border-foreground/30 ring-1 ring-foreground/20" : "border-card-border hover:border-foreground/20"}`}
                  >
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                    {verifFilter === s.filterKey && <p className="text-[10px] text-foreground/50 mt-0.5">● filtered</p>}
                  </button>
                ))}
              </div>

              {/* Filter chips + search row */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                {verifFilter !== "all" && (
                  <button
                    onClick={() => setVerifFilter("all")}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-foreground/10 text-xs font-medium text-foreground hover:bg-foreground/20 transition-colors"
                  >
                    {verifFilter.replace("_", " ")} ×
                  </button>
                )}
                <div className="relative flex-1 min-w-48">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <input
                    type="text"
                    value={verifSearch}
                    onChange={e => setVerifSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  {verifSearch && (
                    <button
                      onClick={() => setVerifSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              </div>

              {verificationsData.users.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground text-sm">
                    {verifSearch || verifFilter !== "all" ? "No results for current filter / search." : "No verification submissions yet."}
                  </div>
                ) : (
                <div className="space-y-4">
                  {verificationsLoading && verificationsData && (
                    <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />)}</div>
                  )}
                  {verificationsData.users.map((user: any) => (
                    <div key={user.clerkId} className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-semibold text-foreground text-sm">{user.username || user.fullName || user.email || user.clerkId}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              user.verificationStatus === "approved" ? "bg-green-100 text-green-700" :
                              user.verificationStatus === "pending" ? "bg-amber-100 text-amber-700" :
                              user.verificationStatus === "rejected" ? "bg-red-100 text-red-700" :
                              "bg-blue-100 text-blue-700"
                            }`}>
                              {user.verificationStatus}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-0.5">
                            <span className="font-medium">Name on ID:</span> {user.verifiedName || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground mb-0.5">
                            <span className="font-medium">Doc type:</span> {user.idDocumentType || "—"}
                          </p>
                          {user.verificationRejectionReason && (
                            <p className="text-xs text-red-600 mt-1">
                              <span className="font-medium">Rejection reason:</span> {user.verificationRejectionReason}
                            </p>
                          )}
                          {user.idDocumentPath && (
                            <a
                              href={`https://drive.google.com/file/d/${user.idDocumentPath}/view`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                              View Document on Drive
                            </a>
                          )}
                        </div>

                        {/* Actions */}
                        {user.verificationStatus !== "approved" && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              onClick={() => handleVerifApprove(user.clerkId)}
                              disabled={verifActionId === user.clerkId}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                            >
                              {verifActionId === user.clerkId ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => { setVerifRejectId(user.clerkId); setVerifRejectReason(""); }}
                              disabled={verifActionId === user.clerkId}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleVerifRequestReupload(user.clerkId, "")}
                              disabled={verifActionId === user.clerkId}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-muted text-muted-foreground hover:bg-muted/70 disabled:opacity-50 transition-colors"
                            >
                              Ask Re-upload
                            </button>
                          </div>
                        )}
                        {user.verificationStatus === "approved" && (
                          <div className="shrink-0 flex items-center gap-1.5 text-green-600 text-xs font-semibold">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                            Approved
                          </div>
                        )}
                      </div>

                      {/* Inline reject reason input */}
                      {verifRejectId === user.clerkId && (
                        <div className="mt-4 border-t border-border pt-4 space-y-2">
                          <label className="text-xs font-semibold text-foreground block">Rejection reason (required):</label>
                          <textarea
                            rows={2}
                            value={verifRejectReason}
                            onChange={e => setVerifRejectReason(e.target.value)}
                            placeholder="e.g. Document is blurry, name does not match..."
                            className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVerifReject(user.clerkId, verifRejectReason)}
                              disabled={!verifRejectReason.trim() || verifActionId === user.clerkId}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              Confirm Rejection
                            </button>
                            <button onClick={() => setVerifRejectId(null)} className="px-4 py-2 rounded-xl text-xs font-bold border border-border text-muted-foreground hover:bg-muted transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={verifSentinelRef} className="h-1" />
                  {verificationsLoading && (verificationsData?.users.length ?? 0) > 0 && (
                    <div className="py-4 text-center text-sm text-muted-foreground animate-pulse">Loading more…</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}


    </div>
  );
}
