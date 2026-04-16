import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setAuthTokenGetter, useGetMe, useClaimReferral, useLogReferralClick } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

import Layout from "@/components/layout";
import OneSignalUserSync from "@/components/onesignal-user-sync";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Questions from "@/pages/questions";
import QuestionDetail from "@/pages/question-detail";
import Wallet from "@/pages/wallet";
import Ask from "@/pages/ask";
import Insights from "@/pages/insights";
import Admin from "@/pages/admin";
import Profile from "@/pages/profile";
import ProfileQuestions from "@/pages/profile-questions";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";
import Contact from "@/pages/contact";
import About from "@/pages/about";
import HowItWorks from "@/pages/how-it-works";
import Invite from "@/pages/invite";

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
  const { data: me } = useGetMe({ query: { enabled: isSignedIn } });
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
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
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

function SignInPage() {
  return (
    <div className="flex justify-center py-16">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex justify-center py-16">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
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

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <OneSignalUserSync />
        <ClerkQueryClientCacheInvalidator />
        <ClerkAuthTokenSetter />
        <ReferralCapture />
        <ReferralClaimHandler />
        <Layout>
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
            <Route path="/privacy" component={Privacy} />
            <Route path="/terms" component={Terms} />
            <Route path="/contact" component={Contact} />
            <Route path="/about" component={About} />
            <Route path="/how-it-works" component={HowItWorks} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
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
