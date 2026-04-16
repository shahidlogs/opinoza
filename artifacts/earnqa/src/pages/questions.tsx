import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@clerk/react";
import { useGetCategories, VALID_CATEGORIES } from "@workspace/api-client-react";
import { usePageMeta } from "@/lib/page-meta";

// ── Profile question top card ─────────────────────────────────────────────────

function ProfileQuestionBanner({ question }: { question: any }) {
  const isFullName = question.title?.toLowerCase().includes("full name");
  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-6"
    >
      <Link href={`/questions/${question.id}`}>
        <div className="group relative bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 sm:p-6 cursor-pointer hover:border-amber-400 hover:shadow-md transition-all">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400 text-white">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
              </svg>
              Profile Question · Earn 2¢
            </span>
            <span className="text-xs text-amber-700 font-medium">Answer to unlock the next one</span>
          </div>

          {/* Question title */}
          <h3 className="font-bold text-foreground text-base sm:text-lg leading-snug mb-2 group-hover:text-amber-800 transition-colors">
            {question.title}
          </h3>

          {/* Full-name payment note */}
          {isFullName && (
            <p className="text-xs text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 mt-2 leading-relaxed">
              Please enter your real full name with correct spelling. This is important because your payments will be made using this name.
            </p>
          )}

          {/* Description */}
          {question.description && !isFullName && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
              {question.description}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 mt-3 text-xs text-amber-700 font-medium">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
            </svg>
            Tap to answer
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

const PAGE_SIZE = 12;

const TYPE_LABELS: Record<string, string> = {
  short_answer: "Short Answer",
  poll: "Poll",
  rating: "Rating",
};

const TYPE_COLORS: Record<string, string> = {
  short_answer: "bg-slate-50 text-slate-700 border-slate-200",
  poll: "bg-blue-50 text-blue-700 border-blue-200",
  rating: "bg-amber-50 text-amber-700 border-amber-200",
};

const TYPE_ICONS: Record<string, string> = {
  short_answer: "✍️",
  poll: "📊",
  rating: "⭐",
};

function SkeletonCard() {
  return (
    <div className="bg-card border border-card-border rounded-xl p-5 animate-pulse">
      <div className="flex gap-2 mb-3">
        <div className="h-5 bg-muted rounded-full w-24" />
        <div className="h-5 bg-muted rounded-full w-20" />
      </div>
      <div className="h-5 bg-muted rounded w-4/5 mb-2" />
      <div className="h-4 bg-muted rounded w-3/5 mb-4" />
      <div className="flex justify-between">
        <div className="h-4 bg-muted rounded w-20" />
        <div className="h-4 bg-muted rounded w-16" />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin text-amber-500"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type Question = {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  category: string;
  categories?: string[] | null;
  status: string;
  pollOptions?: string[] | null;
  isCustom: boolean;
  totalAnswers: number;
};

type SortBy = "all" | "newest" | "oldest" | "answered" | "unanswered";

const SORT_OPTIONS: { value: SortBy; label: string; requiresAuth?: boolean }[] = [
  { value: "all", label: "All Questions" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "answered", label: "Answered by me", requiresAuth: true },
  { value: "unanswered", label: "Unanswered by me", requiresAuth: true },
];

export default function Questions() {
  usePageMeta(
    "Browse Questions – Opinoza",
    "Browse hundreds of questions on Opinoza and earn 1¢ for every answer you give. Filter by category, type, or search for topics you care about.",
    "https://opinoza.com/questions",
  );

  const { isSignedIn, getToken } = useAuth();
  const [category, setCategory] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  // Debounced value — actually sent to the API (300 ms after last keystroke)
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("all");

  // Debounce: update debouncedSearch 300 ms after search changes
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState<number | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isError, setIsError] = useState(false);

  // ── Profile question (one unanswered at a time) ───────────────────────────
  const [topProfileQuestion, setTopProfileQuestion] = useState<any | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const fetchProfileQuestion = useCallback(async () => {
    if (!isSignedIn) {
      setTopProfileQuestion(null);
      setProfileLoaded(true);
      return;
    }
    try {
      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${base}/api/questions/profile`, { headers });
      if (!res.ok) { setProfileLoaded(true); return; }
      const data = await res.json();

      // Enforce fixed display sequence on the browse page.
      // Questions whose title matches a keyword come first in the defined order;
      // all other profile questions follow in their original backend order (id ASC).
      const PRIORITY_KEYWORDS: string[] = ["full name", "city", "age group", "gender", "country"];
      const priority = (q: any): number => {
        const t = (q.title ?? "").toLowerCase();
        const idx = PRIORITY_KEYWORDS.findIndex(kw => t.includes(kw));
        return idx === -1 ? PRIORITY_KEYWORDS.length : idx;
      };
      const sorted = [...(data.questions ?? [])].sort((a: any, b: any) => priority(a) - priority(b));
      const first = sorted.find((q: any) => !q.userHasAnswered) ?? null;
      setTopProfileQuestion(first);
    } catch {
      // silently ignore — profile banner is non-critical
    } finally {
      setProfileLoaded(true);
    }
  }, [isSignedIn, getToken]);

  useEffect(() => {
    fetchProfileQuestion();
  }, [fetchProfileQuestion]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: catData } = useGetCategories();
  // Build count map from API, then drive dropdown from VALID_CATEGORIES order
  const catCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of catData?.categories ?? []) map[c.category] = c.count;
    return map;
  }, [catData]);
  const categories = VALID_CATEGORIES.map(cat => ({
    category: cat,
    count: catCountMap[cat] ?? 0,
  }));

  const hasMore = total === null ? true : allQuestions.length < total;

  // ── Fetch a page ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(
    async (currentOffset: number, signal: AbortSignal) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(currentOffset),
        status: "active",
      });
      if (category) params.set("category", category);
      if (type) params.set("type", type);

      const headers: Record<string, string> = {};

      // Always send auth token when signed in so the backend can detect
      // which questions the user has answered (used for search ranking and filters).
      if (isSignedIn) {
        const token = await getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }

      if (debouncedSearch) {
        // Search mode: backend handles ranking (unanswered-first, newest-first)
        params.set("search", debouncedSearch);
      } else if (sortBy === "oldest") {
        params.set("order", "asc");
      } else if (sortBy === "unanswered" && isSignedIn) {
        params.set("excludeAnswered", "true");
      } else if (sortBy === "answered" && isSignedIn) {
        params.set("onlyAnswered", "true");
      }

      const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
      const res = await fetch(`${base}/api/questions?${params}`, { signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ questions: Question[]; total: number }>;
    },
    [category, type, sortBy, debouncedSearch, isSignedIn, getToken],
  );

  // ── Reset whenever filters change ─────────────────────────────────────────
  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setAllQuestions([]);
    setOffset(0);
    setTotal(null);
    setIsInitialLoading(true);
    setIsError(false);

    fetchPage(0, ac.signal)
      .then(data => {
        if (ac.signal.aborted) return;
        setAllQuestions(data.questions);
        setOffset(data.questions.length);
        setTotal(data.total);
        setIsInitialLoading(false);
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        setIsError(true);
        setIsInitialLoading(false);
      });

    return () => ac.abort();
  }, [category, type, fetchPage]);

  // ── Load more (called by IntersectionObserver) ────────────────────────────
  const loadMore = useCallback(() => {
    if (isFetchingMore || !hasMore || isInitialLoading) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setIsFetchingMore(true);

    fetchPage(offset, ac.signal)
      .then(data => {
        if (ac.signal.aborted) return;
        setAllQuestions(prev => {
          const existingIds = new Set(prev.map(q => q.id));
          const fresh = data.questions.filter(q => !existingIds.has(q.id));
          return [...prev, ...fresh];
        });
        setOffset(prev => prev + data.questions.length);
        setTotal(data.total);
        setIsFetchingMore(false);
      })
      .catch(err => {
        if (err.name === "AbortError") return;
        setIsFetchingMore(false);
      });
  }, [fetchPage, isFetchingMore, hasMore, isInitialLoading, offset]);

  // ── IntersectionObserver on sentinel div ──────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const hasFilters = !!(category || type || search.trim() || sortBy !== "all");

  const clearAll = () => { setCategory(""); setType(""); setSearch(""); setSortBy("all"); };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-foreground tracking-tight">Browse Questions</h1>
        <p className="text-muted-foreground mt-1.5">
          {isSignedIn
            ? <>Answer questions and earn <span className="text-amber-600 font-semibold">1¢</span> per question</>
            : <>Sign in and answer to earn <span className="text-amber-600 font-semibold">1¢</span> per question</>
          }
        </p>
      </div>

      {/* ── Search + Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.category} value={c.category}>
              {c.category} ({c.count})
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <option value="">All Types</option>
          <option value="short_answer">✍️ Short Answer</option>
          <option value="poll">📊 Poll</option>
          <option value="rating">⭐ Rating</option>
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          className="px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value} disabled={opt.requiresAuth && !isSignedIn}>
              {opt.label}{opt.requiresAuth && !isSignedIn ? " (sign in)" : ""}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={clearAll}
            className="px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Profile question priority banner (one at a time) ── */}
      <AnimatePresence>
        {isSignedIn && profileLoaded && topProfileQuestion && (
          <ProfileQuestionBanner question={topProfileQuestion} />
        )}
      </AnimatePresence>

      {/* ── Results count ── */}
      {!isInitialLoading && !isError && (
        <p className="text-sm text-muted-foreground mb-4">
          {allQuestions.length === 0
            ? "No questions found"
            : debouncedSearch
              ? `${total ?? allQuestions.length} result${(total ?? allQuestions.length) !== 1 ? "s" : ""} matching "${debouncedSearch}"`
              : total !== null
                ? `Showing ${allQuestions.length} of ${total} question${total !== 1 ? "s" : ""}`
                : `${allQuestions.length} question${allQuestions.length !== 1 ? "s" : ""} loaded`}
        </p>
      )}

      {/* ── States ── */}
      {isError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-2">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
          </svg>
          <p className="font-medium">Failed to load questions</p>
          <p className="text-sm mt-1">Please refresh the page</p>
        </div>
      ) : isInitialLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(9)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : allQuestions.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 opacity-30">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <p className="font-medium text-foreground">No questions found</p>
          <p className="text-sm mt-2">
            {hasFilters ? "Try adjusting your filters or search" : "Check back soon for new questions"}
          </p>
          {hasFilters && (
            <button
              onClick={clearAll}
              className="mt-4 px-5 py-2 rounded-xl text-sm gold-gradient text-white font-medium hover:opacity-90 transition-all shadow-sm"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {allQuestions.map((q, i) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: Math.min(i * 0.03, 0.25), duration: 0.3 }}
                  layout
                >
                  <Link href={`/questions/${q.id}`}>
                    <div className="group bg-card border border-card-border rounded-2xl p-5 sm:p-6 cursor-pointer card-hover h-full flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TYPE_COLORS[q.type] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
                          {TYPE_ICONS[q.type]} {TYPE_LABELS[q.type] || q.type}
                        </span>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {(q.categories ?? [q.category]).map(cat => (
                            <span key={cat} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>

                      <h3 className="font-semibold text-foreground leading-snug mb-2 flex-1 group-hover:text-amber-700 transition-colors line-clamp-2 text-[0.95rem]">
                        {q.title}
                      </h3>

                      {q.description && (
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
                          {q.description}
                        </p>
                      )}

                      {q.type === "poll" && q.pollOptions && q.pollOptions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {q.pollOptions.slice(0, 3).map(opt => (
                            <span key={opt} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/50">
                              {opt}
                            </span>
                          ))}
                          {q.pollOptions.length > 3 && (
                            <span className="text-xs text-muted-foreground self-center">
                              +{q.pollOptions.length - 3} more
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs mt-auto pt-3 border-t border-border/60">
                        <span className="text-muted-foreground">
                          {q.totalAnswers} answer{q.totalAnswers !== 1 ? "s" : ""}
                        </span>
                        <span className="earn-badge">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
                          </svg>
                          Earn 1¢
                        </span>
                      </div>

                      {q.isCustom && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-blue-500 font-medium flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                          Community question
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ── Sentinel + bottom status ── */}
          <div ref={sentinelRef} className="mt-10 flex flex-col items-center gap-3 pb-8">
            {isFetchingMore && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Spinner />
                <span>Loading more questions…</span>
              </motion.div>
            )}

            {!isFetchingMore && !hasMore && allQuestions.length > 0 && !search && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <div className="h-px bg-border flex-1 w-16" />
                <span className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-500">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" />
                  </svg>
                  You've seen all {total} questions
                </span>
                <div className="h-px bg-border flex-1 w-16" />
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
