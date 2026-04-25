import { useState, useRef, useCallback } from "react";
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
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";

const DOC_TYPES = [
  "National ID / CNIC",
  "Driving License",
  "Passport",
  "Student Card / Student ID",
  "Other valid ID",
] as const;

// ── File upload config ──────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 10;
const MAX_COMPRESS_DIMENSION = 2048; // px — keeps ID text fully readable
const JPEG_QUALITY = 0.85;

// All MIME types accepted by the backend (after any client-side compression)
const ACCEPTED_MIME_SET = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/heic", "image/heif",
  "application/pdf",
]);

const ACCEPTED_FORMAT_LABEL = "JPG, PNG, WebP, HEIC or PDF";

// File extensions mapped to their canonical MIME type, used when file.type is empty
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function guessFileMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "";
}

/**
 * Compress an image using an off-screen canvas.
 * Works for JPEG, PNG, WebP and HEIC (on iOS Safari which has native HEIC support).
 * Returns JPEG output at 85% quality, scaled to max MAX_COMPRESS_DIMENSION in any direction.
 * Throws if the image cannot be decoded (e.g. HEIC on non-iOS desktop browsers).
 */
function compressImageViaCanvas(file: File): Promise<{ base64: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > MAX_COMPRESS_DIMENSION || height > MAX_COMPRESS_DIMENSION) {
        const ratio = Math.min(MAX_COMPRESS_DIMENSION / width, MAX_COMPRESS_DIMENSION / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
      const base64  = dataUrl.split(",")[1] ?? "";
      const baseName = file.name.replace(/\.[^.]+$/, "");
      resolve({ base64, filename: `${baseName}.jpg` });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image decode failed"));
    };

    img.src = objectUrl;
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
    label: "Question Submission",
    icon: <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(217 91% 60%)" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
    </div>,
  },
  question_rejection_refund: {
    label: "Rejection Refund",
    icon: <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(25 95% 53%)" strokeWidth="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
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
  pending:      { cls: "bg-amber-50 text-amber-700 border-amber-100",   label: "Under Review (up to 3 working days)" },
  approved:     { cls: "bg-blue-50 text-blue-700 border-blue-100",      label: "Approved – Payment Processing (up to 7 working days)" },
  completed:    { cls: "bg-blue-50 text-blue-700 border-blue-100",      label: "Approved – Payment Processing (up to 7 working days)" },
  transferred:  { cls: "bg-green-50 text-green-700 border-green-100",   label: "Paid" },
  rejected:     { cls: "bg-red-50 text-red-700 border-red-100",         label: "Rejected" },
};

const PAYMENT_METHODS = ["PayPal", "Bank Transfer", "USDT"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

const METHOD_DISPLAY: Record<PaymentMethod, string> = {
  "PayPal": "PayPal",
  "Bank Transfer": "Bank Transfer",
  "USDT": "USDT (Crypto)",
};
const PAYMENT_PLACEHOLDERS: Record<string, string> = {
  "PayPal": "PayPal email",
  "Bank Transfer": "Account number / IBAN",
};
const USDT_NETWORKS = ["TRC20", "ERC20", "BEP20"] as const;

export default function Wallet() {
  const queryClient = useQueryClient();
  const { data: wallet, isLoading: walletLoading } = useGetWallet();
  const { data: txData, isLoading: txLoading } = useGetTransactions();
  const { data: withdrawalData, isLoading: withdrawalLoading } = useGetWithdrawalHistory();
  const { data: meData, refetch: refetchMe } = useGetMe();
  const requestWithdrawal = useRequestWithdrawal();

  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [historyTab, setHistoryTab] = useState<"transactions" | "withdrawals">("transactions");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("PayPal");
  const [details, setDetails] = useState("");
  const [accountTitle, setAccountTitle] = useState("");
  const [bankName, setBankName] = useState("");
  const [usdtNetwork, setUsdtNetwork] = useState<string>("TRC20");
  const [usdtAddress, setUsdtAddress] = useState("");
  const [usdtOwnerName, setUsdtOwnerName] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Verification form state
  const [verifDocType, setVerifDocType] = useState(DOC_TYPES[0] as string);
  const [verifName, setVerifName] = useState("");
  const [verifFile, setVerifFile] = useState<File | null>(null);
  const [verifError, setVerifError] = useState("");
  const [verifSuccess, setVerifSuccess] = useState("");
  const [verifSubmitting, setVerifSubmitting] = useState(false);
  const verifFileRef = useRef<HTMLInputElement>(null);

  const verificationStatus = (meData as any)?.verificationStatus ?? "unverified";
  const verificationRejectionReason = (meData as any)?.verificationRejectionReason ?? null;

  const handleVerificationSubmit = useCallback(async () => {
    setVerifError("");

    if (!verifName.trim()) { setVerifError("Please enter your name as it appears on your ID."); return; }
    if (!verifFile)         { setVerifError("Please select an identity document."); return; }

    // ── MIME type validation ───────────────────────────────────────────────
    const detectedMime = guessFileMime(verifFile);
    if (detectedMime && !ACCEPTED_MIME_SET.has(detectedMime)) {
      setVerifError(
        `"${verifFile.name}" is not a supported format. Please upload a ${ACCEPTED_FORMAT_LABEL} file.`
      );
      return;
    }

    // ── Raw size guard (pre-compression) ─────────────────────────────────
    if (verifFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setVerifError(`File too large (${(verifFile.size / 1024 / 1024).toFixed(1)} MB). Maximum ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    setVerifSubmitting(true);
    try {
      let base64: string;
      let mimeType: string;
      let filename: string;

      const isPdf = detectedMime === "application/pdf";

      if (isPdf) {
        // PDFs: send as-is — canvas cannot compress them
        base64   = await readFileAsBase64(verifFile);
        mimeType = "application/pdf";
        filename = verifFile.name;
      } else {
        // Images: compress via canvas → JPEG (smaller body, faster upload)
        // Falls back to raw bytes if browser cannot decode the image (e.g. HEIC on non-iOS desktop)
        try {
          const compressed = await compressImageViaCanvas(verifFile);
          base64   = compressed.base64;
          mimeType = "image/jpeg";
          filename = compressed.filename;
        } catch {
          // Canvas decode failed — send raw bytes and hope for the best
          base64   = await readFileAsBase64(verifFile);
          mimeType = detectedMime || "image/jpeg";
          filename = verifFile.name;

          // Re-check size since no compression happened
          const approxBytes = Math.round(base64.length * 0.75);
          if (approxBytes > MAX_FILE_SIZE_MB * 1024 * 1024) {
            setVerifError(
              `This image format (${detectedMime || "unknown"}) cannot be compressed in your browser and is too large to upload. ` +
              `Please take a screenshot of the document and upload the screenshot as a JPG or PNG instead.`
            );
            return;
          }
        }
      }

      const resp = await fetch("/api/users/me/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: verifDocType,
          verifiedName: verifName.trim(),
          documentBase64: base64,
          documentMimeType: mimeType,
          documentFilename: filename,
        }),
      });

      if (resp.status === 413) {
        setVerifError(`File is too large. Please upload a file smaller than ${MAX_FILE_SIZE_MB} MB.`);
        return;
      }
      let data: any = {};
      try { data = await resp.json(); } catch { /* non-JSON body */ }
      if (!resp.ok) {
        setVerifError(data.error || `Upload failed (HTTP ${resp.status}). Please try again.`);
      } else {
        setVerifSuccess("Your identity document has been submitted. We will review it and notify you.");
        setVerifFile(null);
        setVerifName("");
        if (verifFileRef.current) verifFileRef.current.value = "";
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        refetchMe();
      }
    } catch {
      setVerifError("Submission failed. Please check your connection and try again.");
    } finally {
      setVerifSubmitting(false);
    }
  }, [verifDocType, verifName, verifFile, queryClient, refetchMe]);

  const transactions = txData?.transactions ?? [];
  const balance = wallet?.balanceCents ?? 0;

  const MIN_WITHDRAWAL = 500; // $5 in cents

  const amountNum = parseInt(amount, 10);
  const isValidAmount = amount && !isNaN(amountNum) && amountNum >= MIN_WITHDRAWAL && amountNum <= balance;
  const isBankTransfer = method === "Bank Transfer";
  const isUsdt = method === "USDT";
  const canSubmit =
    isValidAmount &&
    (isUsdt
      ? usdtNetwork.length > 0 && usdtAddress.trim().length > 0
      : details.trim().length > 0 &&
        (!isBankTransfer || accountTitle.trim().length > 0) &&
        (!isBankTransfer || bankName.trim().length > 0)) &&
    !requestWithdrawal.isPending;
  const belowMinimum = balance < MIN_WITHDRAWAL;

  const handleWithdraw = () => {
    if (!canSubmit) return;

    const baseData: Record<string, unknown> = {
      amountCents: amountNum,
      paymentMethod: method,
    };

    if (isUsdt) {
      baseData.usdtNetwork = usdtNetwork;
      baseData.usdtAddress = usdtAddress.trim();
      if (usdtOwnerName.trim()) baseData.usdtOwnerName = usdtOwnerName.trim();
    } else {
      baseData.paymentDetails = details.trim();
      if (isBankTransfer) {
        baseData.accountTitle = accountTitle.trim();
        baseData.bankName = bankName.trim();
      }
    }

    requestWithdrawal.mutate({ data: baseData as any }, {
      onSuccess: () => {
        setShowWithdrawal(false);
        setAmount("");
        setDetails("");
        setAccountTitle("");
        setBankName("");
        setUsdtAddress("");
        setUsdtOwnerName("");
        setSuccessMsg("Your withdrawal request has been submitted and will be reviewed within 3 working days.");
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

      {/* Identity Verification Panel */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-6">
        {verificationStatus === "approved" ? (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(142 76% 36%)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <div>
              <p className="text-sm font-bold text-green-800">Identity Verified</p>
              <p className="text-xs text-green-700 mt-0.5">Your identity has been verified. You may request a withdrawal when your balance reaches $5.</p>
            </div>
          </div>
        ) : verificationStatus === "pending" ? (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 40%)" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-800">Verification Under Review</p>
              <p className="text-xs text-amber-700 mt-0.5">Your verification is under review. We'll notify you once it's complete. Identity verification is required before payout.</p>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(217 91% 60%)" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h8M8 14h5"/></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  {verificationStatus === "rejected" ? "Verification Rejected — Please Re-upload" :
                   verificationStatus === "reupload_requested" ? "Re-upload Requested" :
                   "Identity Verification Required"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {verificationStatus === "rejected" && verificationRejectionReason
                    ? `Reason: ${verificationRejectionReason}`
                    : verificationStatus === "reupload_requested" && verificationRejectionReason
                    ? verificationRejectionReason
                    : "Provide identity proof to withdraw your earnings. Your documents will be kept confidential and used only for verification and payout review."}
                </p>
              </div>
            </div>

            {verifSuccess ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 font-medium flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                {verifSuccess}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">Accepted documents:</p>
                  <p>National ID / CNIC · Driving License · Passport · Student Card</p>
                  <p className="text-blue-700">The name on your ID must match the name on your account. If you are a student, you may upload your student card.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Document Type</label>
                  <select
                    value={verifDocType}
                    onChange={e => setVerifDocType(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Your Name on ID <span className="text-destructive">*</span></label>
                  <input
                    type="text"
                    value={verifName}
                    onChange={e => setVerifName(e.target.value)}
                    placeholder="Name exactly as it appears on your ID"
                    className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Upload Document <span className="text-destructive">*</span></label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${verifFile ? "border-blue-400 bg-blue-50" : "border-border hover:border-blue-300"}`}
                    onClick={() => verifFileRef.current?.click()}
                  >
                    {verifFile ? (
                      <div className="text-sm text-blue-700 font-medium flex items-center justify-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                        {verifFile.name} ({(verifFile.size / 1024 / 1024).toFixed(1)} MB)
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        <p className="font-medium text-foreground mb-0.5">Click to choose file</p>
                        <p>{ACCEPTED_FORMAT_LABEL} · Max {MAX_FILE_SIZE_MB} MB</p>
                        <p className="mt-0.5 text-[11px] opacity-70">iPhone camera photos are supported</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={verifFileRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      setVerifError("");
                      setVerifFile(file);
                    }}
                  />
                </div>

                {verifError && (
                  <p className="text-xs text-destructive flex items-center gap-1.5 font-medium">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                    {verifError}
                  </p>
                )}

                <button
                  onClick={handleVerificationSubmit}
                  disabled={verifSubmitting || !verifName.trim() || !verifFile}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {verifSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                      Uploading...
                    </span>
                  ) : "Submit Verification"}
                </button>
              </div>
            )}
          </div>
        )}
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
              onClick={() => !belowMinimum && verificationStatus === "approved" && setShowWithdrawal(true)}
              disabled={belowMinimum || verificationStatus !== "approved"}
              className="w-full py-4 rounded-xl gold-gradient text-white font-bold text-base shadow-md hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {balance === 0
                ? "No balance to withdraw yet"
                : verificationStatus !== "approved"
                  ? "Verify Identity to Withdraw"
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
                  <p className="text-sm font-semibold text-amber-800">Minimum withdrawal amount is $5</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    You have <span className="font-bold">{balance}¢</span> — need <span className="font-bold">{500 - balance}¢</span> more to unlock withdrawals.
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
                  Amount <span className="text-muted-foreground font-normal">(cents · min 500¢ = $5)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={`500 – ${balance}`}
                    min="500"
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
                    Minimum withdrawal amount is $5 (500¢)
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
                  {[500, 1000, 2500, 5000, balance].filter((v, i, arr) => v > 0 && v <= balance && arr.indexOf(v) === i).slice(0, 4).map(preset => (
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
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMethod(m); setDetails(""); setAccountTitle(""); setBankName(""); setUsdtAddress(""); setUsdtOwnerName(""); }}
                      className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                        method === m
                          ? "border-amber-400 bg-amber-50 text-amber-700"
                          : "border-border text-muted-foreground hover:border-amber-200"
                      }`}
                    >
                      {METHOD_DISPLAY[m]}
                    </button>
                  ))}
                </div>
              </div>

              {/* PayPal / Bank Transfer details */}
              {!isUsdt && (
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-2">
                    {isBankTransfer ? "Account Number / IBAN" : "Payment Details"}
                  </label>
                  <input
                    type="text"
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                    placeholder={PAYMENT_PLACEHOLDERS[method] ?? "Payment details"}
                    className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              )}

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

              {/* USDT (Crypto) fields */}
              {isUsdt && (
                <>
                  {/* Warning banner */}
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="hsl(43 96% 40%)" strokeWidth="2.5" className="mt-0.5 shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4m0 4h.01"/>
                    </svg>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Please make sure your USDT network and wallet address are correct. Payments sent to the wrong network or address may be permanently lost.
                    </p>
                  </div>

                  {/* Network */}
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Network <span className="text-destructive">*</span>
                    </label>
                    <select
                      value={usdtNetwork}
                      onChange={e => setUsdtNetwork(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {USDT_NETWORKS.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>

                  {/* Wallet Address */}
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      USDT Wallet Address <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={usdtAddress}
                      onChange={e => setUsdtAddress(e.target.value)}
                      placeholder="Your USDT wallet address"
                      className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono text-sm"
                    />
                  </div>

                  {/* Wallet Owner Name (optional) */}
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      Wallet Owner Name <span className="text-muted-foreground font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={usdtOwnerName}
                      onChange={e => setUsdtOwnerName(e.target.value)}
                      placeholder="Name associated with this wallet (optional)"
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
                Withdrawals are reviewed within 3 working days. Your balance is held immediately.
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
                const txMeta = (tx as any).meta as Record<string, string> | null | undefined;
                const isUsdtTx = parsedMethod === "USDT (Crypto)" || !!txMeta?.usdtAddress;
                // Mask wallet address: show first 6 + last 4 chars
                const maskAddress = (addr: string) =>
                  addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
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
                        {isUsdtTx ? (
                          <>
                            {txMeta?.usdtNetwork && (
                              <div className="text-xs text-muted-foreground">Network: <span className="font-medium text-foreground/80">{txMeta.usdtNetwork}</span></div>
                            )}
                            {txMeta?.usdtAddress && (
                              <div className="text-xs text-muted-foreground">Wallet: <span className="font-medium text-foreground/80 font-mono">{maskAddress(txMeta.usdtAddress)}</span></div>
                            )}
                            {txMeta?.usdtOwnerName && (
                              <div className="text-xs text-muted-foreground">Owner: <span className="font-medium text-foreground/80">{txMeta.usdtOwnerName}</span></div>
                            )}
                          </>
                        ) : (
                          <>
                            {parsedDetails && (
                              <div className="text-xs text-muted-foreground">Account / IBAN: <span className="font-medium text-foreground/80">{parsedDetails}</span></div>
                            )}
                            {tx.accountTitle && (
                              <div className="text-xs text-muted-foreground">Account Title: <span className="font-medium text-foreground/80">{tx.accountTitle}</span></div>
                            )}
                            {(tx as any).bankName && (
                              <div className="text-xs text-muted-foreground">Bank / Wallet: <span className="font-medium text-foreground/80">{(tx as any).bankName}</span></div>
                            )}
                          </>
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
