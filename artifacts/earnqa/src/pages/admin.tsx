import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@clerk/react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  useGetMe,
  useGetAdminStats,
  useGetAdminGrowth,
  useAdminListQuestions,
  getAdminListQuestionsQueryKey,
  useApproveQuestion,
  useRejectQuestion,
  useAdminListUsers,
  useAdminListWithdrawals,
  getAdminListWithdrawalsQueryKey,
  useApproveWithdrawal,
  useRejectWithdrawalAdmin,
  useTransferWithdrawal,
  useGetAdminReferralStats,
  useGetAdminReferralList,
  usePatchAdminReferralStatus,
  useReverseAdminReferral,
  VALID_CATEGORIES,
} from "@workspace/api-client-react";

type AdminTab = "questions" | "all-questions" | "users" | "withdrawals" | "stats" | "referrals" | "flags";

const REJECTION_REASONS = [
  "Not an opinion, preference, habit, or behavior-based question",
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
  onSaved: () => void;
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
      onSaved();
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

function UserProfileModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-card-border rounded-2xl shadow-xl p-6 w-full max-w-sm"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-foreground">User Profile</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
        </div>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full gold-gradient flex items-center justify-center text-white font-bold text-lg shrink-0">
            {(user.name || user.email || "?")[0].toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-foreground">{user.name || "—"}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
          </div>
        </div>
        <div className="space-y-3 text-sm">
          {[
            { label: "Role", value: user.isAdmin ? "Admin" : "User" },
            { label: "Joined", value: new Date(user.createdAt).toLocaleDateString() },
            { label: "Questions Created", value: user.questionCount ?? 0 },
            { label: "Answers Given", value: user.answerCount ?? 0 },
            { label: "Total Earned", value: formatCents(user.earningsCents ?? 0) },
            { label: "Current Balance", value: formatCents(user.balanceCents ?? 0) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{String(value)}</span>
            </div>
          ))}
        </div>
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-card-border rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">
            Answers by {user.name || user.email}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Loading...</p>
          ) : answers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No answers yet</p>
          ) : answers.map(a => (
            <div key={a.id} className="p-3 rounded-xl border border-border bg-muted/30">
              <p className="font-medium text-foreground text-sm">{a.questionTitle || `Question #${a.questionId}`}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.questionType}</span>
                {a.pollOption && <span className="text-xs text-foreground">Chose: <strong>{a.pollOption}</strong></span>}
                {a.rating != null && <span className="text-xs text-foreground">Rating: <strong>{a.rating}/10</strong></span>}
                {a.answerText && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{a.answerText}</span>}
                <span className="text-xs text-muted-foreground ml-auto">{new Date(a.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
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
  approvePending,
  rejectPending,
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
  approvePending: boolean;
  rejectPending: boolean;
}) {
  const [showFeaturedControls, setShowFeaturedControls] = useState(false);
  const [featurePos, setFeaturePos] = useState<number>(q.featuredPosition ?? 1);

  return (
    <div className="bg-card border border-card-border rounded-xl p-5 shadow-sm">
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
                onClick={() => onApprove(q.id)}
                disabled={approvePending}
                className="px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors disabled:opacity-40"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(q.id)}
                disabled={rejectPending}
                className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
              >
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

export default function Admin() {
  const { data: me } = useGetMe();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("questions");
  const [editingQuestion, setEditingQuestion] = useState<any | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userQuestionsUser, setUserQuestionsUser] = useState<any | null>(null);
  const [userAnswersUser, setUserAnswersUser] = useState<any | null>(null);
  const [growthRange, setGrowthRange] = useState("30");
  const [adminSearch, setAdminSearch] = useState("");
  const [userSort, setUserSort] = useState<string>("");
  const [byUserData, setByUserData] = useState<any[] | null>(null);
  const [byUserLoading, setByUserLoading] = useState(false);
  const [expandedReferrer, setExpandedReferrer] = useState<string | null>(null);
  const [flagsData, setFlagsData] = useState<{ items: any[]; pending: number; resolved: number; removed: number } | null>(null);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagActionId, setFlagActionId] = useState<number | null>(null);
  const [rejectModalId, setRejectModalId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const { data: statsData } = useGetAdminStats();
  const { data: growthData, isLoading: growthLoading } = useGetAdminGrowth({ days: growthRange });
  const { data: pendingQuestionsData, isLoading: pendingLoading } = useAdminListQuestions({ status: "pending" });
  const { data: allQuestionsData, isLoading: allQuestionsLoading } = useAdminListQuestions({});
  const { data: usersData } = useAdminListUsers();
  const { data: withdrawalsData } = useAdminListWithdrawals();
  const approveQuestion = useApproveQuestion();
  const rejectQuestion = useRejectQuestion();
  const approveWithdrawal = useApproveWithdrawal();
  const rejectWithdrawalMutation = useRejectWithdrawalAdmin();
  const transferWithdrawalMutation = useTransferWithdrawal();
  const { data: refStatsData, refetch: refetchRefStats } = useGetAdminReferralStats({ query: { enabled: tab === "referrals" } });
  const { data: refListData, isLoading: refListLoading, refetch: refetchRefList } = useGetAdminReferralList({ query: { enabled: tab === "referrals" } });
  const patchRefStatus = usePatchAdminReferralStatus();
  const reverseRef = useReverseAdminReferral();

  function refetchReferrals() {
    refetchRefStats();
    refetchRefList();
  }

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

  const fetchFlags = useCallback(async () => {
    setFlagsLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/flags", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) setFlagsData(await res.json());
    } finally {
      setFlagsLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (tab === "flags") fetchFlags();
  }, [tab, fetchFlags]);

  const handleFlagRemoveAnswer = async (answerId: number) => {
    if (!confirm("Permanently remove this answer from the platform?")) return;
    setFlagActionId(answerId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin/answers/${answerId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) await fetchFlags();
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
      if (res.ok) await fetchFlags();
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
      if (res.ok) await fetchFlags();
    } finally {
      setFlagActionId(null);
    }
  };

  const invalidateWithdrawals = () => queryClient.invalidateQueries({ queryKey: getAdminListWithdrawalsQueryKey() });

  const handleEdit = useCallback((q: any) => setEditingQuestion(q), []);

  const handleToggleProfile = useCallback(async (q: any) => {
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${q.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isProfileQuestion: !q.isProfileQuestion }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
    }
  }, [getToken, queryClient]);

  const handleFeatureQuestion = useCallback(async (id: number, isFeatured: boolean, position: number | null) => {
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${id}/featured`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ isFeatured, featuredPosition: position }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
    }
  }, [getToken, queryClient]);

  const handleApproveQuestion = useCallback((id: number) => {
    approveQuestion.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
        queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
      },
    });
  }, [approveQuestion, queryClient]);

  const handleRejectQuestion = useCallback((id: number) => {
    setRejectReason("");
    setRejectModalId(id);
  }, []);

  const confirmRejectQuestion = useCallback(() => {
    if (rejectModalId === null || !rejectReason) return;
    rejectQuestion.mutate({ id: rejectModalId, data: { rejectionReason: rejectReason } }, {
      onSuccess: () => {
        setRejectModalId(null);
        setRejectReason("");
        queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
        queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
      },
    });
  }, [rejectModalId, rejectReason, rejectQuestion, queryClient]);

  const handleDeleteQuestion = useCallback(async (id: number) => {
    if (!confirm("Permanently delete this question?\n\nThis will fail if the question already has answers — use 'Archive Duplicate' instead.")) return;
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
    } else if (res.status === 409) {
      const data = await res.json();
      alert(`Cannot delete: ${data.error}\n\n${data.suggestion}`);
    }
  }, [getToken, queryClient]);

  const handleArchiveDuplicate = useCallback(async (id: number) => {
    if (!confirm("Archive this question as a duplicate?\n\nIt will be hidden from public view, but all answers, earnings, and transaction history will be fully preserved.")) return;
    const token = await getToken();
    const res = await fetch(`/api/admin/questions/${id}/archive-duplicate`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
      queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to archive question");
    }
  }, [getToken, queryClient]);

  if (!me?.isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Admin Access Required</h1>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
        <Link href="/dashboard">
          <button className="mt-6 px-6 py-2.5 rounded-xl gold-gradient text-white font-semibold shadow-sm hover:opacity-90">Back to Dashboard</button>
        </Link>
      </div>
    );
  }

  const pendingQuestions = pendingQuestionsData?.questions ?? [];
  const allQuestions = allQuestionsData?.questions ?? [];
  const users = usersData?.users ?? [];

  const searchTerm = adminSearch.trim().toLowerCase();
  const filteredQuestions = searchTerm
    ? allQuestions.filter(q =>
        (q.title ?? "").toLowerCase().includes(searchTerm) ||
        (q.description ?? "").toLowerCase().includes(searchTerm)
      )
    : allQuestions;
  const filteredUsers = searchTerm
    ? users.filter((u: any) =>
        (u.name ?? "").toLowerCase().includes(searchTerm) ||
        (u.email ?? "").toLowerCase().includes(searchTerm)
      )
    : users;
  const sortedUsers = [...filteredUsers].sort((a: any, b: any) => {
    switch (userSort) {
      case "earnings-desc": return (b.earningsCents ?? 0) - (a.earningsCents ?? 0);
      case "earnings-asc":  return (a.earningsCents ?? 0) - (b.earningsCents ?? 0);
      case "answers-desc":  return (b.answerCount ?? 0) - (a.answerCount ?? 0);
      case "answers-asc":   return (a.answerCount ?? 0) - (b.answerCount ?? 0);
      case "questions-desc": return (b.questionCount ?? 0) - (a.questionCount ?? 0);
      case "questions-asc":  return (a.questionCount ?? 0) - (b.questionCount ?? 0);
      default: return 0;
    }
  });
  const withdrawals = withdrawalsData?.transactions ?? [];
  const pendingWithdrawals = withdrawals.filter(w => w.status === "pending" || w.status === "approved" || w.status === "completed");
  const stats = statsData;

  const tabs: { key: AdminTab; label: string; badge?: number }[] = [
    { key: "questions", label: "Pending Review", badge: pendingQuestions.length },
    { key: "all-questions", label: "All Questions" },
    { key: "withdrawals", label: "Withdrawals", badge: pendingWithdrawals.length },
    { key: "users", label: "Users" },
    { key: "stats", label: "Stats" },
    { key: "referrals", label: "Referrals", badge: refStatsData?.flaggedCount ?? 0 },
    { key: "flags", label: "Flags", badge: flagsData?.pending ?? undefined },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Edit Modal */}
      <AnimatePresence>
        {editingQuestion && (
          <EditQuestionModal
            question={editingQuestion}
            onClose={() => setEditingQuestion(null)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({}) });
              queryClient.invalidateQueries({ queryKey: getAdminListQuestionsQueryKey({ status: "pending" }) });
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
        {selectedUser && <UserProfileModal user={selectedUser} onClose={() => setSelectedUser(null)} />}
      </AnimatePresence>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl gold-gradient flex items-center justify-center shadow-md">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Platform management</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-8 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setAdminSearch(""); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
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
      {(tab === "all-questions" || tab === "users") && (
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
            placeholder={tab === "all-questions" ? "Search by title or description…" : "Search by name or email…"}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400/40"
          />
        </div>
      )}

      {/* Pending Questions */}
      {tab === "questions" && (
        <div className="space-y-4">
          {pendingLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : pendingQuestions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 opacity-30">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <p className="font-medium">No pending questions</p>
              <p className="text-sm mt-1">All questions have been reviewed</p>
            </div>
          ) : (
            pendingQuestions.map(q => (
              <QuestionRow
                key={q.id} q={q} showApproveReject
                onEdit={handleEdit} onToggleProfile={handleToggleProfile}
                onFeature={handleFeatureQuestion}
                onApprove={handleApproveQuestion} onReject={handleRejectQuestion}
                onDelete={handleDeleteQuestion} onArchiveDuplicate={handleArchiveDuplicate}
                approvePending={approveQuestion.isPending} rejectPending={rejectQuestion.isPending}
              />
            ))
          )}
        </div>
      )}

      {/* All Questions */}
      {tab === "all-questions" && (
        <div className="space-y-3">
          {allQuestionsLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground">
              {searchTerm ? `No questions match "${adminSearch}"` : "No questions found"}
            </div>
          ) : (
            filteredQuestions.map(q => (
              <QuestionRow
                key={q.id} q={q} showApproveReject={q.status === "pending"}
                onEdit={handleEdit} onToggleProfile={handleToggleProfile}
                onFeature={handleFeatureQuestion}
                onApprove={handleApproveQuestion} onReject={handleRejectQuestion}
                onDelete={handleDeleteQuestion} onArchiveDuplicate={handleArchiveDuplicate}
                approvePending={approveQuestion.isPending} rejectPending={rejectQuestion.isPending}
              />
            ))
          )}
        </div>
      )}

      {/* Withdrawals */}
      {tab === "withdrawals" && (
        <div className="space-y-3">
          {withdrawals.length === 0 ? (
            <div className="bg-card border border-card-border rounded-xl p-10 text-center text-muted-foreground">No withdrawal requests</div>
          ) : (
            withdrawals.map((tx: any, i: number) => {
              // Parse method + details from description: "Withdrawal via METHOD — DETAILS"
              const descMatch = (tx.description || "").match(/^Withdrawal via (.+?) — (.+)$/);
              const parsedMethod = descMatch ? descMatch[1] : null;
              const parsedDetails = descMatch ? descMatch[2] : tx.description;
              // Find matching full user from already-fetched users list
              const fullUser = users.find((u: any) => u.clerkId === (tx.userClerkId || tx.userId));
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
                        {parsedDetails && <span> · {parsedDetails}</span>}
                      </div>
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
                              onClick={() => approveWithdrawal.mutate({ id: tx.id }, { onSuccess: invalidateWithdrawals })}
                              disabled={approveWithdrawal.isPending}
                              className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors disabled:opacity-40"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => rejectWithdrawalMutation.mutate({ id: tx.id }, { onSuccess: invalidateWithdrawals })}
                              disabled={rejectWithdrawalMutation.isPending}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
                            >
                              {rejectWithdrawalMutation.isPending ? "..." : "Reject"}
                            </button>
                          </>
                        )}
                        {(tx.status === "approved" || tx.status === "completed") && (
                          <button
                            onClick={() => transferWithdrawalMutation.mutate({ id: tx.id }, { onSuccess: invalidateWithdrawals })}
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
            })
          )}
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        <div>
          <AnimatePresence>
            {userQuestionsUser && <UserQuestionsModal user={userQuestionsUser} questions={allQuestions} onClose={() => setUserQuestionsUser(null)} />}
            {userAnswersUser && <UserAnswersModal user={userAnswersUser} getToken={getToken} onClose={() => setUserAnswersUser(null)} />}
          </AnimatePresence>
          <div className="flex justify-end mb-3">
            <select
              value={userSort}
              onChange={e => setUserSort(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Sort by: Default</option>
              <option value="earnings-desc">Highest Earnings</option>
              <option value="earnings-asc">Lowest Earnings</option>
              <option value="answers-desc">Most Answers</option>
              <option value="answers-asc">Least Answers</option>
              <option value="questions-desc">Most Questions Created</option>
              <option value="questions-asc">Least Questions Created</option>
            </select>
          </div>

          <div className="bg-card border border-card-border rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">User</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden sm:table-cell">Questions</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden md:table-cell">Answers</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground hidden md:table-cell">Earnings</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Joined</th>
                  <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Role</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                      {searchTerm ? `No users match "${adminSearch}"` : "No users found"}
                    </td>
                  </tr>
                ) : null}
                {sortedUsers.map((u: any, i: number) => (
                  <tr key={u.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="font-medium text-foreground hover:text-amber-600 transition-colors text-left"
                      >
                        {u.name || "—"}
                      </button>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
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
                    <td className="px-5 py-3.5">
                      {u.isAdmin
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full gold-gradient text-white">Admin</span>
                        : <span className="text-xs text-muted-foreground">User</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && <div className="p-10 text-center text-muted-foreground">No users found</div>}
          </div>
        </div>
      )}

      {/* Stats */}
      {tab === "stats" && (
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
        </div>
      )}

      {/* Referrals */}
      {tab === "referrals" && (
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
            {refListLoading ? (
              <div className="space-y-3 p-6">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}</div>
            ) : (refListData?.referrals?.length ?? 0) === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-12">No referrals yet.</div>
            ) : (
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
                    {refListData!.referrals.map(r => (
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
                              {r.fraudFlags.map(f => (
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
      {tab === "flags" && (
        <div>
          {/* Summary row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Pending", value: flagsData?.pending ?? 0, color: "text-amber-600 bg-amber-50 border-amber-200" },
              { label: "Resolved", value: flagsData?.resolved ?? 0, color: "text-green-600 bg-green-50 border-green-200" },
              { label: "Removed", value: flagsData?.removed ?? 0, color: "text-red-600 bg-red-50 border-red-200" },
            ].map(stat => (
              <div key={stat.label} className={`border rounded-2xl p-4 text-center ${stat.color}`}>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm font-medium mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {flagsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading flags…</div>
          ) : !flagsData || flagsData.items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-4xl mb-3">🎉</div>
              <p className="font-medium">No flagged answers found</p>
              <p className="text-sm mt-1">All answers are in good standing</p>
            </div>
          ) : (
            <div className="space-y-4">
              {flagsData.items.map((item: any) => (
                <div key={item.answerId} className={`bg-card border rounded-2xl p-5 shadow-sm ${item.flagStatus === "pending" ? "border-amber-300" : item.flagStatus === "removed" ? "border-red-200 opacity-60" : "border-border"}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5 truncate">{item.questionTitle || "Unknown Question"}</p>
                      <p className="font-medium text-foreground">
                        &ldquo;{item.answerText}&rdquo;
                      </p>
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

                  {/* Individual flags */}
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
                                disabled={flagActionId === f.id}
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

                  {/* Actions */}
                  {item.flagStatus !== "removed" && (
                    <div className="flex gap-2 flex-wrap">
                      {item.flagStatus === "pending" && (
                        <button
                          onClick={() => handleClearFlag(item.answerId)}
                          disabled={flagActionId === item.answerId}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                        >
                          Clear Flag (keep answer)
                        </button>
                      )}
                      <button
                        onClick={() => handleFlagRemoveAnswer(item.answerId)}
                        disabled={flagActionId === item.answerId}
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
            </div>
          )}
        </div>
      )}

    </div>
  );
}
