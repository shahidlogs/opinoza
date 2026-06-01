// ─── MAINTENANCE MODE ────────────────────────────────────────────────────────
// Toggle with MAINTENANCE_MODE=true on the API server (no frontend rebuild needed).
// Admins and editors bypass maintenance automatically via /api/maintenance-status.

function MaintenancePage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#fffbf5",
        padding: "24px",
        textAlign: "center",
        fontFamily:
          "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 24,
          boxShadow: "0 4px 24px rgba(245,158,11,0.25)",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4l3 3" />
        </svg>
      </div>

      <h1
        style={{
          fontSize: "clamp(22px, 5vw, 30px)",
          fontWeight: 700,
          color: "#1c1917",
          margin: "0 0 12px",
          letterSpacing: "-0.4px",
          lineHeight: 1.2,
        }}
      >
        Opinoza
      </h1>

      <p
        style={{
          fontSize: "clamp(15px, 3vw, 17px)",
          color: "#57534e",
          maxWidth: 420,
          lineHeight: 1.65,
          margin: "0 0 32px",
        }}
      >
        Opinoza is under maintenance. We are upgrading the system and will be back soon.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 20px",
          borderRadius: 999,
          background: "#fef3c7",
          border: "1px solid #fde68a",
          color: "#92400e",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        We'll be back shortly
      </div>

      <a
        href="/sign-in"
        style={{
          marginTop: 32,
          fontSize: 12,
          color: "#a8a29e",
          textDecoration: "none",
        }}
      >
        Admin? Sign in to continue →
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

import { lazy, Suspense, useEffect, useRef, useState, useCallback } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { Switch, Route, useLocation, useSearch, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter, useGetMe, useClaimReferral, useLogReferralClick } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

import Layout from "@/components/layout";
import OneSignalUserSync from "@/components/onesignal-user-sync";
import NotFound from "@/pages/not-found";

// Route-level code splitting — each page is loaded only when first visited.
// This keeps the initial JS bundle small for first-time visitors.
const Home            = lazy(() => import("@/pages/home"));
const Dashboard       = lazy(() => import("@/pages/dashboard"));
const Questions       = lazy(() => import("@/pages/questions"));
const QuestionDetail  = lazy(() => import("@/pages/question-detail"));
const Wallet          = lazy(() => import("@/pages/wallet"));
const Ask             = lazy(() => import("@/pages/ask"));
const Insights        = lazy(() => import("@/pages/insights"));
const Admin           = lazy(() => import("@/pages/admin"));
const Profile         = lazy(() => import("@/pages/profile"));
const ProfileQuestions = lazy(() => import("@/pages/profile-questions"));
const PublicProfile   = lazy(() => import("@/pages/public-profile"));
const Privacy         = lazy(() => import("@/pages/privacy"));
const Terms           = lazy(() => import("@/pages/terms"));
const Contact         = lazy(() => import("@/pages/contact"));
const About           = lazy(() => import("@/pages/about"));
const HowItWorks      = lazy(() => import("@/pages/how-it-works"));
const HowEarningsWork = lazy(() => import("@/pages/how-earnings-work"));
const Invite          = lazy(() => import("@/pages/invite"));
const Safety          = lazy(() => import("@/pages/safety"));
const BlogIndex       = lazy(() => import("@/pages/blog-index"));
const BlogHowItWorks  = lazy(() => import("@/pages/blog-how-it-works"));
const BlogEarnMoney   = lazy(() => import("@/pages/blog-earn-money"));
const BlogSurveyApps  = lazy(() => import("@/pages/blog-survey-apps"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-7 h-7 border-[3px] border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const REF_KEY = "opinoza_ref_code";

// Captures ?ref=CODE on any page load and stores it for later claim
function ReferralCapture() {
  const clickMutation = useLogReferralClick();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem(REF_KEY, ref);
      clickMutation.mutate({ data: { referralCode: ref } });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// After new user signup, claims the referral code.
// Always fires on first login — sends localStorage code if present,
// or empty string to trigger server-side 24h IP attribution fallback.
function ReferralClaimHandler() {
  const { isSignedIn } = useUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: me } = useGetMe({ query: { enabled: !!isSignedIn } as any });
  const claimMutation = useClaimReferral();
  const claimed = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !me?.isNew || claimed.current) return;
    claimed.current = true;
    const code = localStorage.getItem(REF_KEY) ?? "";
    claimMutation.mutate(
      { data: { referralCode: code } },
      { onSettled: () => { if (code) localStorage.removeItem(REF_KEY); } }
    );
  }, [isSignedIn, me?.isNew]);

  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains. Do not inline the env var, leave
// publishableKey undefined, or replace publishableKeyFromHost with anything else.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly), auto-set
// in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV — the empty dev value
// is intentional, and any branching breaks the prod proxy.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

// ── Clerk appearance — Opinoza brand ─────────────────────────────────────────
// Color palette mirrors the app's CSS variables:
//   primary  = hsl(43, 96%, 56%)  — amber gold
//   bg       = hsl(36, 33%, 97%)  — warm cream
//   text     = hsl(224, 25%, 12%) — dark navy
//   muted    = hsl(224, 15%, 45%) — medium grey
//   border   = hsl(38, 30%, 85%)  — warm stone
//
// Text-bearing element keys use inline style objects so the colours are applied
// reliably inside Clerk's component scope (Tailwind utility classes don't reach there).
const clerkAppearance = {
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(43, 96%, 56%)",
    colorBackground: "hsl(36, 33%, 97%)",
    colorInput: "#ffffff",
    colorForeground: "hsl(224, 25%, 12%)",
    colorMutedForeground: "hsl(224, 15%, 45%)",
    colorInputForeground: "hsl(224, 25%, 12%)",
    colorNeutral: "hsl(224, 25%, 12%)",
    colorDanger: "hsl(0, 84%, 60%)",
    borderRadius: "0.75rem",
    fontFamily: "inherit",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "rounded-2xl w-full overflow-hidden shadow-xl border border-[hsl(38,30%,85%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: { style: { color: "hsl(224, 25%, 12%)", fontWeight: "800", fontSize: "1.375rem" } },
    headerSubtitle: { style: { color: "hsl(224, 15%, 45%)" } },
    socialButtonsBlockButtonText: { style: { color: "hsl(224, 25%, 12%)", fontWeight: "500" } },
    formFieldLabel: { style: { color: "hsl(224, 25%, 12%)", fontWeight: "500", fontSize: "0.875rem" } },
    footerActionLink: { style: { color: "hsl(43, 96%, 38%)", fontWeight: "600" } },
    footerActionText: { style: { color: "hsl(224, 15%, 45%)" } },
    dividerText: { style: { color: "hsl(224, 15%, 45%)" } },
    identityPreviewEditButton: { style: { color: "hsl(43, 96%, 38%)", fontWeight: "600" } },
    formFieldSuccessText: { style: { color: "hsl(142, 76%, 36%)" } },
    alertText: { style: { color: "hsl(224, 25%, 12%)" } },
    socialButtonsBlockButton: "border border-[hsl(38,30%,85%)] hover:bg-[hsl(36,33%,94%)] transition-colors",
    dividerLine: "bg-[hsl(38,30%,85%)]",
  },
};

const clerkLocalization = {
  signIn: {
    start: {
      title: "Welcome back",
      subtitle: "Sign in to Opinoza and start earning",
    },
  },
  signUp: {
    start: {
      title: "Join Opinoza",
      subtitle: "Create your account and earn rewards for every answer",
    },
  },
};

// Detects clicks on social OAuth buttons inside Clerk's rendered components
// and shows a loading overlay to prevent accidental double-clicks.
// Uses a ref for the guard flag so the event handler is stable (no closure
// gap between re-renders where a fast second click could sneak through).
function useOAuthLoading() {
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      // Clear any pending auto-reset timer when the element unmounts
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }

    const handler = (e: Event) => {
      if (loadingRef.current) return;

      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;

      const text = btn.textContent?.toLowerCase() ?? "";
      const isSocial =
        text.includes("google") ||
        text.includes("apple") ||
        text.includes("facebook") ||
        text.includes("github") ||
        text.includes("continue with");

      if (!isSocial) return;

      loadingRef.current = true;
      setLoading(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      // Auto-reset after 12 s in case the user cancels the OAuth flow.
      timerRef.current = setTimeout(() => {
        loadingRef.current = false;
        setLoading(false);
      }, 12_000);
    };

    el.addEventListener("click", handler, true);
    return () => el.removeEventListener("click", handler, true);
  }, []); // stable — loadingRef never changes identity

  return { loading, containerRef };
}

function OAuthLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm font-medium text-muted-foreground">Connecting…</p>
    </div>
  );
}

function AuthLegalDisclosure() {
  return (
    <p className="mt-4 text-center text-xs text-muted-foreground leading-relaxed max-w-sm mx-auto">
      By continuing, you agree to Opinoza's{" "}
      <a href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">Terms of Service</a>
      ,{" "}
      <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">Privacy Policy</a>
      , and{" "}
      <a href="/safety" className="underline underline-offset-2 hover:text-foreground transition-colors">Community Guidelines</a>
      .
    </p>
  );
}

function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  const { loading, containerRef } = useOAuthLoading();
  const search = useSearch();
  const redirectUrl = new URLSearchParams(search).get("redirect_url") ?? undefined;
  const signUpUrl = `${basePath}/sign-up${redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""}`;
  return (
    <div className="flex justify-center py-16 px-4">
      <div ref={containerRef} className="relative w-full max-w-md">
        {loading && <OAuthLoadingOverlay />}
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={signUpUrl}
          forceRedirectUrl={redirectUrl}
          fallbackRedirectUrl={redirectUrl}
        />
        <AuthLegalDisclosure />
      </div>
    </div>
  );
}

function SignUpPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  const { loading, containerRef } = useOAuthLoading();
  const search = useSearch();
  const redirectUrl = new URLSearchParams(search).get("redirect_url") ?? undefined;
  const signInUrl = `${basePath}/sign-in${redirectUrl ? `?redirect_url=${encodeURIComponent(redirectUrl)}` : ""}`;
  return (
    <div className="flex justify-center py-16 px-4">
      <div ref={containerRef} className="relative w-full max-w-md">
        {loading && <OAuthLoadingOverlay />}
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={signInUrl}
          forceRedirectUrl={redirectUrl}
          fallbackRedirectUrl={redirectUrl}
        />
        <AuthLegalDisclosure />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkAuthTokenSetter() {
  const { session } = useClerk();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (!session) return null;
      return session.getToken();
    });
  }, [session]);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

/**
 * Fetches /api/maintenance-status (always exempt from maintenance middleware).
 * Waits for Clerk to load so the auth token is included — this prevents
 * a flash of the maintenance screen for admin/editor users.
 * Sign-in and sign-up routes always render regardless, so admins can log in.
 */
function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { isLoaded } = useUser();
  const { session } = useClerk();
  const [active, setActive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const token = session ? await session.getToken() : null;
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const r = await fetch(`${basePath}/api/maintenance-status`, { headers });
        if (!cancelled) setActive((await r.json()).active === true);
      } catch {
        if (!cancelled) setActive(false);
      }
    })();
    return () => { cancelled = true; };
  // Re-check when auth state changes (admin logs in → gets access immediately)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, session?.id]);

  // Always render sign-in/sign-up so admins can authenticate during maintenance
  const isAuthRoute = location.startsWith("/sign-in") || location.startsWith("/sign-up");
  if (isAuthRoute) return <>{children}</>;

  if (active === null) return <PageFallback />;
  if (active) return <MaintenancePage />;
  return <>{children}</>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
      appearance={clerkAppearance}
      localization={clerkLocalization}
    >
      <QueryClientProvider client={queryClient}>
        <OneSignalUserSync />
        <ClerkQueryClientCacheInvalidator />
        <ClerkAuthTokenSetter />
        <ReferralCapture />
        <ReferralClaimHandler />
        <MaintenanceGate>
        <Layout>
          <Suspense fallback={<PageFallback />}>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/questions" component={Questions} />
              <Route path="/questions/:id" component={QuestionDetail} />
              <Route path="/insights" component={Insights} />
              <Route path="/dashboard">
                {() => <ProtectedRoute component={Dashboard} />}
              </Route>
              <Route path="/wallet">
                {() => <ProtectedRoute component={Wallet} />}
              </Route>
              <Route path="/ask">
                {() => <ProtectedRoute component={Ask} />}
              </Route>
              <Route path="/invite">
                {() => <ProtectedRoute component={Invite} />}
              </Route>
              <Route path="/admin">
                {() => <ProtectedRoute component={Admin} />}
              </Route>
              <Route path="/profile/questions">
                {() => <ProtectedRoute component={ProfileQuestions} />}
              </Route>
              <Route path="/profile">
                {() => <ProtectedRoute component={Profile} />}
              </Route>
              <Route path="/u/:id" component={PublicProfile} />
              <Route path="/how-earnings-work" component={HowEarningsWork} />
              <Route path="/privacy" component={Privacy} />
              <Route path="/terms" component={Terms} />
              <Route path="/contact" component={Contact} />
              <Route path="/about" component={About} />
              <Route path="/how-it-works" component={HowItWorks} />
              <Route path="/safety" component={Safety} />
              <Route path="/blog/opinoza-how-it-works" component={BlogHowItWorks} />
              <Route path="/blog/earn-money-opinion-platforms" component={BlogEarnMoney} />
              <Route path="/blog/best-survey-apps-2026" component={BlogSurveyApps} />
              <Route path="/blog" component={BlogIndex} />
              <Route component={NotFound} />
            </Switch>
          </Suspense>
        </Layout>
        </MaintenanceGate>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
