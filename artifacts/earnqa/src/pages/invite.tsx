import { useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { useGetMyReferrals } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const APP_BASE_URL = "https://opinoza.com";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    flagged: "bg-amber-100 text-amber-700",
    rejected: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    approved: "active",
    pending: "pending",
    flagged: "active",
    rejected: "reversed",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function Invite() {
  const { isSignedIn } = useUser();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useGetMyReferrals({ query: { enabled: isSignedIn } });

  const referralLink = data?.referralLink ?? `${APP_BASE_URL}/?ref=...`;
  const linkReady = Boolean(data?.referralLink);

  function copyLink() {
    const link = data?.referralLink ?? referralLink;

    const finish = () => {
      setCopied(true);
      toast({ title: "Copied!", description: "Your invite link is in your clipboard." });
      setTimeout(() => setCopied(false), 2500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(finish).catch(() => fallbackCopy(link, finish));
    } else {
      fallbackCopy(link, finish);
    }
  }

  function fallbackCopy(text: string, onSuccess: () => void) {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      try {
        document.execCommand("copy");
        onSuccess();
      } catch {
        toast({ title: "Copy failed", description: "Please long-press the link to copy it.", variant: "destructive" });
      }
    } else {
      const el = document.createElement("input");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy");
        onSuccess();
      } catch {
        toast({ title: "Copy failed", description: "Please long-press the link to copy it.", variant: "destructive" });
      }
      document.body.removeChild(el);
    }
  }

  function shareLink() {
    const link = data?.referralLink ?? referralLink;
    if (navigator.share) {
      navigator.share({
        title: "Join me on Opinoza",
        text: "Answer questions & earn cash rewards. Sign up with my invite link!",
        url: link,
      }).catch(() => {});
    } else {
      copyLink();
    }
  }

  const totalEarnedDollars = ((data?.totalEarnedCents ?? 0) / 100).toFixed(2);

  if (!isSignedIn) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">🔗</div>
          <h2 className="text-2xl font-bold text-navy-900 mb-2">Invite & Earn</h2>
          <p className="text-muted-foreground">Sign in to get your personal referral link and start earning.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="text-5xl mb-3">🎁</div>
        <h1 className="text-3xl font-bold text-navy-900">Invite & Earn</h1>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Share your invite link and earn <strong>10¢</strong> when a friend signs up,{" "}
          plus <strong>0.5¢</strong> every time they answer a question.
        </p>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4"
      >
        {[
          { label: "Friends Invited", value: isLoading ? "—" : String(data?.totalSignups ?? 0) },
          { label: "Total Earned", value: isLoading ? "—" : `$${totalEarnedDollars}` },
          { label: "Pending", value: isLoading ? "—" : String(data?.pendingCount ?? 0) },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <div className="text-2xl font-bold text-navy-900">{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Link box */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4"
      >
        <h2 className="font-semibold text-navy-900">Your Invite Link</h2>
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <input
            ref={inputRef}
            type="text"
            readOnly
            value={isLoading ? "Loading your link..." : referralLink}
            onFocus={e => e.currentTarget.select()}
            className="flex-1 text-sm text-gray-700 font-mono bg-transparent border-none outline-none min-w-0"
          />
          <button
            onClick={copyLink}
            disabled={isLoading}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-40"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div className="flex gap-3">
          <button
            onClick={shareLink}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-navy-900 text-white hover:bg-navy-800 active:scale-95 transition-all disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Share
          </button>
        </div>

        {/* Referral code */}
        {data?.referralCode && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Your code:</span>
            <span className="font-mono font-bold text-navy-900 bg-gray-100 px-2 py-0.5 rounded-md select-all">
              {data.referralCode}
            </span>
          </div>
        )}
      </motion.div>

      {/* How it works */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-amber-50 border border-amber-100 rounded-2xl p-6"
      >
        <h2 className="font-semibold text-navy-900 mb-4">How it works</h2>
        <ol className="space-y-3">
          {[
            { icon: "🔗", text: "Copy your unique invite link above" },
            { icon: "📨", text: "Share it with friends via text, social media, or email" },
            { icon: "✅", text: "When they sign up, you earn 10¢ instantly" },
            { icon: "📈", text: "You keep earning 0.5¢ each time they answer a question" },
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-xl shrink-0">{step.icon}</span>
              <span className="text-sm text-gray-700">{step.text}</span>
            </li>
          ))}
        </ol>
      </motion.div>

      {/* Referral history */}
      {(data?.referrals?.length ?? 0) > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6"
        >
          <h2 className="font-semibold text-navy-900 mb-4">Your Referrals</h2>
          <div className="space-y-3">
            {data!.referrals.map(r => {
              const earned = r.signupBonusCents + r.answerBonusCentsTotal;
              return (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-navy-900 truncate">
                      {r.referredUserName || "Anonymous"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    <span className="text-sm font-semibold text-emerald-600">
                      +{earned.toFixed(1)}¢
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty state */}
      {!isLoading && (data?.totalSignups ?? 0) === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center py-8 text-muted-foreground text-sm"
        >
          No referrals yet — share your link and start earning!
        </motion.div>
      )}
    </div>
  );
}
