import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PageTransition } from "@/components/PageTransition";
import { ScrollProgress } from "@/components/ScrollProgress";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteSuspenseFallback } from "@/components/RouteSuspenseFallback";

import { RequireVerifiedSession } from "@/components/RequireVerifiedSession";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RedirectToAccountTypeIfNeeded } from "@/components/RedirectToAccountTypeIfNeeded";
import { RedirectUnlistedFreelancerToWizard } from "@/components/RedirectUnlistedFreelancerToWizard";
import { AuthProvider } from "@/hooks/useAuthContext";

// Landing stays eager: it's the most common first-visit page so keeping it in
// the main bundle avoids a Suspense flash on the marketing page. Every other
// page is lazy-loaded so heavy deps (Recharts on the dashboard, GSAP/confetti
// on HirePage, etc.) don't ship to visitors who never hit those routes.
import Landing from "./pages/Landing";

const JobDetail = lazy(() => import("./pages/JobDetail"));
const HirePage = lazy(() => import("./pages/HirePage"));
const BrowseStudents = lazy(() => import("./pages/BrowseStudents"));
const StudentsByCategory = lazy(() => import("./pages/StudentsByCategory"));
const Profile = lazy(() => import("./pages/Profile"));
const Messages = lazy(() => import("./pages/Messages"));
const StudentProfilePage = lazy(() => import("./pages/StudentProfile"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));
const ChooseAccountType = lazy(() => import("./pages/ChooseAccountType"));
const ListOnCommunity = lazy(() => import("./pages/ListOnCommunity"));
const Admin = lazy(() => import("./pages/Admin"));
const BusinessDashboard = lazy(() => import("./pages/BusinessDashboard"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const UserSlugRedirect = lazy(() => import("./pages/UserSlugRedirect"));
const HireRequests = lazy(() => import("./pages/HireRequests"));
const ClaimProfile = lazy(() => import("./pages/ClaimProfile"));
const AiFindResults = lazy(() => import("./pages/AiFindResults"));
const AiFindReturn = lazy(() => import("./pages/AiFindReturn"));

// Floating/ambient UI — none are needed for first paint, so defer them via
// Suspense. Failure to load any of these should degrade silently (fallback={null}).
const WhatsAppFloatingButton = lazy(() =>
  import("./components/WhatsAppFloatingButton").then((m) => ({
    default: m.WhatsAppFloatingButton,
  })),
);
const CookieConsentBanner = lazy(() =>
  import("@/components/CookieConsentBanner").then((m) => ({
    default: m.CookieConsentBanner,
  })),
);
const PWAInstallBanner = lazy(() =>
  import("@/components/PWAInstallBanner").then((m) => ({
    default: m.PWAInstallBanner,
  })),
);
const PushNotificationPrompt = lazy(() =>
  import("@/components/PushNotificationPrompt").then((m) => ({
    default: m.PushNotificationPrompt,
  })),
);
const PwaUpdateToast = lazy(() =>
  import("@/components/PwaUpdateToast").then((m) => ({ default: m.PwaUpdateToast })),
);

import type { TransitionVariant } from "./components/PageTransition";
// Eagerly import the in-app browser banner — it's ~2KB and the whole point
// is to warn users BEFORE they try to sign in with Google, so a lazy-load
// flash would defeat the purpose.
import { InAppBrowserBanner } from "@/components/InAppBrowserBanner";

function getVariant(path: string): TransitionVariant {
  if (path === '/') return 'liquid';
  if (path === '/hire') return 'dissolve';
  if (['/auth', '/choose-account-type', '/complete-profile', '/profile', '/business-dashboard', '/messages'].includes(path)) return 'rise';
  if (path.startsWith('/students') || path.startsWith('/jobs/')) return 'morph';
  return 'default';
}

// Route-level Suspense now renders a thin top-of-page progress bar
// (see RouteSuspenseFallback). The previous `fallback={null}` left a
// ~1s blank frame on slow networks (LTE); a centered spinner felt
// janky; a 2px pulsing bar is present-but-ignorable.
//
// The inline RouteErrorBoundary below contains any page-level crash
// to the Routes subtree so the navbar + bottom nav stay visible.
// The top-level ErrorBoundary in main.tsx still catches anything
// that escapes (provider errors, router errors, etc).

const App = () => {
  const location = useLocation();
  const variant = getVariant(location.pathname);
  const P = ({ children }: { children: React.ReactNode }) => <PageTransition variant={variant}>{children}</PageTransition>;

  return (
    <AuthProvider>
    <TooltipProvider>
      <ScrollProgress />
      <ScrollToTop />
      <RedirectToAccountTypeIfNeeded />
      <RedirectUnlistedFreelancerToWizard />
      {/* Self-gating: renders null on real browsers. Warns users in Fiverr /
          Instagram / TikTok / etc in-app browsers that Google OAuth will fail. */}
      <InAppBrowserBanner />
      <Toaster />
      <Sonner />
      <div className="md:pt-14 lg:pt-16" style={{ perspective: '1200px' }}>
      {/* AnimatePresence mode="wait" used to wrap these routes so outgoing
          pages played an exit animation. It races with React's reconciler on
          fast navigations and surfaced the "Failed to execute 'removeChild'
          on 'Node'" error via the global ErrorBoundary. PageTransition still
          plays an enter fade per page; exit is simply skipped. */}
        <RouteErrorBoundary routeKey={location.pathname}>
        <Suspense fallback={<RouteSuspenseFallback />}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<P><Landing /></P>} />
            <Route path="/hire" element={<P><HirePage /></P>} />
            {/* /jobs (no ID) used to 404 — redirect to /hire so people
                who type or land on it from old links hit the right page
                instead of a dead end. /jobs/:id still serves the
                individual job detail view below. */}
            <Route path="/jobs" element={<Navigate to="/hire" replace />} />
            <Route path="/jobs/:id" element={<P><JobDetail /></P>} />
            <Route path="/students" element={<P><BrowseStudents /></P>} />
            <Route path="/students/videography"   element={<P><StudentsByCategory categoryId="videography" /></P>} />
            <Route path="/students/digital_sales" element={<P><StudentsByCategory categoryId="digital_sales" /></P>} />
            <Route path="/students/photography"   element={<Navigate to="/students/digital_sales" replace />} />
            <Route path="/students/websites"      element={<P><StudentsByCategory categoryId="websites" /></P>} />
            <Route path="/students/social_media"  element={<P><StudentsByCategory categoryId="social_media" /></P>} />
            <Route path="/students/:id" element={<P><StudentProfilePage /></P>} />
            <Route
              path="/profile"
              element={
                <RequireVerifiedSession>
                  <P><Profile /></P>
                </RequireVerifiedSession>
              }
            />
            {/* Forced onboarding step — post-auth routing sends any freelancer
                who hasn't published a listing here. See
                resolvePostGoogleAuthDestination in authSession.ts. */}
            <Route
              path="/list-on-community"
              element={
                <RequireVerifiedSession>
                  <P><ListOnCommunity /></P>
                </RequireVerifiedSession>
              }
            />
            <Route path="/dashboard" element={<Navigate to="/business-dashboard" replace />} />
            <Route
              path="/business-dashboard"
              element={
                <RequireVerifiedSession>
                  <P><BusinessDashboard /></P>
                </RequireVerifiedSession>
              }
            />
            <Route
              path="/messages"
              element={
                <RequireVerifiedSession>
                  <P><Messages /></P>
                </RequireVerifiedSession>
              }
            />
            <Route
              path="/hire-requests"
              element={
                <RequireVerifiedSession>
                  <P><HireRequests /></P>
                </RequireVerifiedSession>
              }
            />
            <Route path="/auth" element={<P><Auth /></P>} />
            <Route
              path="/choose-account-type"
              element={
                <RequireVerifiedSession>
                  <P><ChooseAccountType /></P>
                </RequireVerifiedSession>
              }
            />
            <Route
              path="/complete-profile"
              element={
                <RequireVerifiedSession>
                  <P><CompleteProfile /></P>
                </RequireVerifiedSession>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireVerifiedSession>
                  <P><Admin /></P>
                </RequireVerifiedSession>
              }
            />
            {/* AI-Find claim link — public route (no session required to
                load the preview). The page itself handles the unauth →
                /auth → back-to-claim round-trip via sessionStorage. */}
            <Route path="/claim/:token" element={<P><ClaimProfile /></P>} />
            {/* AI Find results page. Requires a verified session because
                contact info on the web pick is RLS-gated to the
                requester and the polling UX relies on a real user. */}
            <Route
              path="/ai-find/:id"
              element={
                <RequireVerifiedSession>
                  <P><AiFindResults /></P>
                </RequireVerifiedSession>
              }
            />
            {/* Stripe Payment Link success landing. Reads the pending
                request id from localStorage (written pre-redirect) and
                bounces to /ai-find/:id. Public route — the results
                page itself enforces the session gate. */}
            <Route path="/ai-find-return" element={<P><AiFindReturn /></P>} />
            <Route path="/u/:slug" element={<P><UserSlugRedirect /></P>} />
            <Route path="/blog/vano-v1" element={<P><BlogPost /></P>} />
            <Route path="/privacy" element={<P><Privacy /></P>} />
            <Route path="/terms" element={<P><Terms /></P>} />
            <Route path="*" element={<P><NotFound /></P>} />
          </Routes>
        </Suspense>
        </RouteErrorBoundary>
      </div>
      <MobileBottomNav />
      {/* Floating/ambient UI — deferred, fallback silently on load failure.
           MascotGuide (wizard + knight floating mascots) was removed —
           users reported the animated speech bubbles and positioning
           were interfering with real page CTAs. If we want ambient
           nudges back, surface them inline in the relevant pages
           (ProfileStrengthCards-style) rather than as a global float. */}
      <Suspense fallback={null}>
        <WhatsAppFloatingButton />
        <CookieConsentBanner />
        <PWAInstallBanner />
        <PushNotificationPrompt />
        <PwaUpdateToast />
      </Suspense>
    </TooltipProvider>
    </AuthProvider>
  );
};

export default App;
