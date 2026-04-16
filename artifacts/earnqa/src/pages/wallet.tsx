import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWallet,
  getGetWalletQueryKey,
  useGetTransactions,
  getGetTransactionsQueryKey,
  useGetWithdrawalHistory,
  getGetWithdrawalHistoryQueryKey,
  useRequestWithdrawal,
} from "@workspace/api-client-react";

const TX_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  earning: {
    label: "Earnings",
    icon: <div className="w-9 h-9 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(142 76% 36%)" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
    </div>,
  },
  withdrawal: {
    label: "Withdrawal",
    icon: <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(0 84% 60%)" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </div>,
  },
  question_creation: {
    label: "Question Created",
    icon: <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(217 91% 60%)" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
    </div>,
  },
  creator_bonus: {
    label: "Creator Bonus",
    icon: <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="hsl(43 96% 56%)"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
    </div>,
  },
  creator_reward: {
    label: "Creator Reward",
    icon: <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="hsl(43 96% 56%)"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>
    </div>,
  },
  referral_signup_bonus: {
    label: "Referral Signup Bonus",
    icon: <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(173 80% 36%)" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    </div>,
  },
  referral_answer_bonus: {
    label: "Referral Answer Bonus",
    icon: <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(173 80% 36%)" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    </div>,
  },
  referral_reversal: {
    label: "Referral Reversal",
    icon: <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(0 84% 60%)" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
    </div>,
  },
  profile_reward: {
    label: "Profile Reward",
    icon: <div className="w-9 h-9 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(262 83% 58%)" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </div>,
  },
};

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  pending:      { cls: "bg-amber-50 text-amber-700 border-amber-100",   label: "Pending" },
  approved:     { cls: "bg-blue-50 text-blue-700 border-blue-100",      label: "Approved" },
  completed:    { cls: "bg-blue-50 text-blue-700 border-blue-100",      label: "Approved" },
  transferred:  { cls: "bg-green-50 text-green-700 border-green-100",   label: "Completed" },
  rejected:     { cls: "bg-red-50 text-red-700 border-red-100",         label: "Rejected" },
};

const PAYMENT_METHODS = ["PayPal", "Bank Transfer"];
const PAYMENT_PLACEHOLDERS: Record<string, string> = {
  "PayPal": "PayPal email",
  "Bank Transfer": "Account number / IBAN",
};

export default function Wallet() {
  const queryClient = useQueryClient();
  const { data: wallet, isLoading: walletLoading } = useGetWallet();
  const { data: txData, isLoading: txLoading } = useGetTransactions();
  const { data: withdrawalData, isLoading: withdrawalLoading } = useGetWithdrawalHistory();
  const requestWithdrawal = useRequestWithdrawal();

  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [historyTab, setHistoryTab] = useState<"transactions" | "withdrawals">("transactions");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("PayPal");
  const [details, setDetails] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [bankName, setBankName] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const transactions = txData?.transactions ?? [];
  const balance = wallet?.balanceCents ?? 0;

  const MIN_WITHDRAWAL = 1000; // $10 in cents

  const amountNum = parseInt(amount, 10);
  const isValidAmount = amount && !isNaN(amountNum) && amountNum >= MIN_WITHDRAWAL && amountNum <= balance;
  const isBankTransfer = method === "Bank Transfer";
  const canSubmit =
    isValidAmount &&
    details.trim().length > 0 &&
    (!isBankTransfer || accountTitle.trim().length > 0) &&
    (!isBankTransfer || bankName.trim().length > 0) &&
    !requestWithdrawal.isPending;
  const belowMinimum = balance < MIN_WITHDRAWAL;

  const handleWithdraw = () => {
    if (!canSubmit) return;
    requestWithdrawal.mutate({
      data: {
        amountCents: amountNum,
        paymentMethod: method,
        paymentDetails: details.trim(),
        ...(isBankTransfer ? { accountTitle: accountTitle.trim(), bankName: bankName.trim() } : {}),
      } as any,
    }, {
      onSuccess: () => {
        setShowWithdrawal(false);
        setAmount(""); setDetails(""); setAccountTitle(""); setBankName("");
        setSuccessMsg(`Withdrawal of ${amountNum}¢ submitted — pending admin review.`);
        setTimeout(() => setSuccessMsg(""), 5000);
        queryClient.invalidateQueries({ queryKey: getGetWalletQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetWithdrawalHistoryQueryKey() });
      },
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">My Wallet</h1>
        <p className="text-muted-foreground mt-1.5">Manage your earnings and withdrawals</p>
      </motion.div>

      {/* Success Banner */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3 text-green-800 text-sm font-medium"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="navy-gradient-deep rounded-2xl p-7 sm:p-8 mb-6 text-white shadow-xl relative overflow-hidden"
      >
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-white/[0.04] -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-amber-400/[0.08] translate-y-1/2 -translate-x-1/4 pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-blue-300/80 text-xs font-semibold uppercase tracking-widest mb-2">Current Balance</p>
              <motion.div
                key={balance}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-end gap-1"
              >
                <span className="text-5xl font-extrabold text-white tabular-nums">{balance}</span>
                <span className="text-2xl text-blue-300 mb-1 font-bold">¢</span>
              </motion.div>
              <p className="text-amber-300 font-bold text-lg mt-1">${(balance / 100).toFixed(2)}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className="text-amber-400">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
              </svg>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5 pt-5 border-t border-white/10">
            <div>
              <p className="text-blue-300/70 text-xs font-medium uppercase tracking-wide mb-1">Total Earned</p>
              <p className="text-xl font-bold tabular-nums">{wallet?.totalEarnedCents ?? 0}¢</p>
              <p className="text-xs text-blue-200/60 mt-0.5">${((wallet?.totalEarnedCents ?? 0) / 100).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-blue-300/70 text-xs font-medium uppercase tracking-wide mb-1">Withdrawn</p>
              <p className="text-xl font-bold tabular-nums">{wallet?.totalWithdrawnCents ?? 0}¢</p>
              <p className="text-xs text-blue-200/60 mt-0.5">${((wallet?.totalWithdrawnCents ?? 0) / 100).toFixed(2)}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Withdraw Button */}
      <AnimatePresence mode="wait">
        {!showWithdrawal && (
          <div className="mb-8">
            <motion.button
              key="btn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              whileHover={{ scale: !belowMinimum ? 1.02 : 1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => !belowMinimum && setShowWithdrawal(true)}
              disabled={belowMinimum}
              className="w-full py-4 rounded-xl gold-gradient text-white font-bold text-base shadow-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {balance === 0
                ? "No balance to withdraw yet"
                : belowMinimum
                  ? `Withdraw (${balance}¢ available)`
                  : `Request Withdrawal (${balance}¢ available)`}
            </motion.button>

            {/* Minimum withdrawal notice */}
            {belowMinimum && balance > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 40%)" strokeWidth="2.5" className="mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Minimum withdrawal amount is $10</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    You have <span className="font-bold">{balance}¢</span> — need <span className="font-bold">{1000 - balance}¢</span> more to unlock withdrawals.
                  </p>
                </div>
              </motion.div>
            )}

            {balance === 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Answer questions to start earning — <span className="text-amber-600 font-semibold">1¢ per answer</span>
              </p>
            )}
          </div>
        )}

        {/* Withdrawal Form */}
        {showWithdrawal && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-card-border rounded-2xl p-6 mb-8 shadow-sm"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-lg text-foreground">Request Withdrawal</h3>
              <button onClick={() => setShowWithdrawal(false)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Amount <span className="text-muted-foreground font-normal">(cents · min 1000¢ = $10)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={`1000 – ${balance}`}
                    min="1000"
                    max={balance}
                    className="w-full px-4 py-3 pr-20 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 tabular-nums"
                  />
                  {amount && !isNaN(amountNum) && amountNum > 0 && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      = ${(amountNum / 100).toFixed(2)}
                    </span>
                  )}
                </div>
                {amount && !isNaN(amountNum) && amountNum > 0 && amountNum < MIN_WITHDRAWAL && (
                  <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1 font-medium">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                    Minimum withdrawal amount is $10 (1000¢)
                  </p>
                )}
                {amount && amountNum > balance && (
                  <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                    Exceeds available balance of {balance}¢
                  </p>
                )}
                {amount && amountNum <= 0 && (
                  <p className="text-xs text-destructive mt-1.5">Amount must be greater than 0</p>
                )}
                <div className="flex gap-2 mt-2">
                  {[1000, 2500, 5000, balance].filter((v, i, arr) => v > 0 && v <= balance && arr.indexOf(v) === i).slice(0, 4).map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(String(preset))}
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                        amountNum === preset ? "gold-gradient text-white border-transparent" : "border-border text-muted-foreground hover:border-amber-300 hover:text-amber-700"
                      }`}
                    >
                      {preset}¢
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMethod(m); setDetails(""); setAccountTitle(""); setBankName(""); }}
                      className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        method === m
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-border text-muted-foreground hover:border-amber-200"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Details */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  {isBankTransfer ? "Account Number / IBAN" : "Payment Details"}
                </label>
                <input
                  type="text"
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder={PAYMENT_PLACEHOLDERS[method]}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Bank Transfer only fields */}
              {isBankTransfer && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Account Title <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={accountTitle}
                      onChange={e => setAccountTitle(e.target.value)}
                      placeholder="Account title (name on bank account)"
                      className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Bank / Wallet Name <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      placeholder="e.g. Meezan Bank, HBL, JazzCash, Easypaisa"
                      className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </>
              )}

              {requestWithdrawal.isError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                  {(requestWithdrawal.error as any)?.data?.error || "Request failed — please try again"}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleWithdraw}
                  disabled={!canSubmit}
                  className="flex-1 py-3.5 rounded-xl gold-gradient text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-all shadow-sm"
                >
                  {requestWithdrawal.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Processing...
                    </span>
                  ) : "Submit Request"}
                </button>
                <button onClick={() => setShowWithdrawal(false)}
                  className="px-5 py-3.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors font-medium">
                  Cancel
                </button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Withdrawals are reviewed within 2–3 business days. Your balance is held immediately.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History tabs */}
      <div>
        {/* Tab toggle */}
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setHistoryTab("transactions")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              historyTab === "transactions"
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-card border border-card-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Transaction History
          </button>
          <button
            onClick={() => setHistoryTab("withdrawals")}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              historyTab === "withdrawals"
                ? "bg-amber-500 text-white shadow-sm"
                : "bg-card border border-card-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Withdrawal History
          </button>
        </div>

        {/* Transaction History tab */}
        {historyTab === "transactions" && (
          txLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-card border border-card-border rounded-xl animate-pulse" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="bg-card border border-card-border rounded-2xl p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 56%)" strokeWidth="1.5">
                  <rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>
                </svg>
              </div>
              <p className="font-semibold text-foreground mb-1">No transactions yet</p>
              <p className="text-sm text-muted-foreground">Answer questions to earn your first cent</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, i) => {
                const cfg = TX_CONFIG[tx.type] || TX_CONFIG.earning;
                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="bg-card border border-card-border rounded-xl px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4"
                  >
                    {cfg.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-clamp-1">{tx.description}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {tx.type === "withdrawal" && (() => {
                          const badge = STATUS_BADGE[tx.status] ?? STATUS_BADGE.pending;
                          return (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${badge.cls}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </p>
                    </div>
                    <div className={`font-bold text-sm tabular-nums shrink-0 ${tx.amountCents > 0 ? "text-green-600" : "text-red-500"}`}>
                      {tx.amountCents > 0 ? "+" : ""}{Number.isInteger(tx.amountCents) ? tx.amountCents : tx.amountCents.toFixed(1)}¢
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )
        )}

        {/* Withdrawal History tab */}
        {historyTab === "withdrawals" && (() => {
          const withdrawals = withdrawalData?.transactions ?? [];
          if (withdrawalLoading) {
            return (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-card border border-card-border rounded-xl animate-pulse" />)}
              </div>
            );
          }
          if (withdrawals.length === 0) {
            return (
              <div className="bg-card border border-card-border rounded-2xl p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(0 84% 60%)" strokeWidth="1.5">
                    <path d="M12 5v14M5 12l7 7 7-7"/>
                  </svg>
                </div>
                <p className="font-semibold text-foreground mb-1">0 Withdrawals</p>
                <p className="text-sm text-muted-foreground">You haven't requested a withdrawal yet</p>
              </div>
            );
          }
          return (
            <div className="space-y-3">
              {withdrawals.map((tx, i) => {
                const descMatch = (tx.description || "").match(/^Withdrawal via (.+?) — (.+)$/);
                const parsedMethod = descMatch ? descMatch[1] : null;
                const parsedDetails = descMatch ? descMatch[2] : tx.description;
                const badge = STATUS_BADGE[tx.status] ?? STATUS_BADGE.pending;
                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-card border border-card-border rounded-xl px-4 sm:px-5 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{parsedMethod ?? "Withdrawal"}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>{badge.label}</span>
                        </div>
                        {parsedDetails && (
                          <div className="text-xs text-muted-foreground">Account / IBAN: <span className="font-medium text-foreground/80">{parsedDetails}</span></div>
                        )}
                        {tx.accountTitle && (
                          <div className="text-xs text-muted-foreground">Account Title: <span className="font-medium text-foreground/80">{tx.accountTitle}</span></div>
                        )}
                        {(tx as any).bankName && (
                          <div className="text-xs text-muted-foreground">Bank / Wallet: <span className="font-medium text-foreground/80">{(tx as any).bankName}</span></div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground pt-0.5">
                          <span>Requested: {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          {tx.approvedAt && (
                            <span>Approved: {new Date(tx.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          )}
                          {tx.transferredAt && (
                            <span className="text-green-600 font-medium">Transferred: {new Date(tx.transferredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          )}
                        </div>
                      </div>
                      <div className="font-bold text-sm tabular-nums shrink-0 text-red-500 mt-0.5">
                        −${(Math.abs(tx.amountCents) / 100).toFixed(2)}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
