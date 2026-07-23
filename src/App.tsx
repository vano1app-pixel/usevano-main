import React, { lazy, Suspense, useEffect } from "react";
import { lazyWithRetry, markChunkLoadRecovered } from "@/lib/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { PageTransition } from "@/components/PageTransition";
import { MotionConfig } from "framer-motion";
import { ScrollProgress } from "@/components/ScrollProgress";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteSuspenseFallback } from "@/components/RouteSuspenseFallback";
import { SilentErrorBoundary } from "@/components/SilentErrorBoundary";
import { AuthProvider } from "@/hooks/useAuthContext";
import { ScrollToTop } from "@/components/ScrollToTop";
import { BottomNav } from "@/components/household/BottomNav";
// Homepage is eager (NOT lazy): it's the landing route every visitor hits
// first and we prerender it to static HTML. If it were a lazy chunk, the SPA
// boot would swap the prerendered page for the Suspense fallback (a blank
// frame with just the top progress bar) while that chunk downloaded — the
// "page bounces to a different screen for a millisecond" flash. Bundling it
// with the app shell means `/` paints immediately with no Suspense gap.
import HouseholdHome from "./pages/HouseholdHome";

const MyBookings = lazyWithRetry(() => import("./pages/MyBookings"));
const Account = lazyWithRetry(() => import("./pages/Account"));
const TrackBooking = lazyWithRetry(() => import("./pages/TrackBooking"));
const StudentDashboard = lazyWithRetry(() => import("./pages/StudentDashboard"));
const StudentJobDetail = lazyWithRetry(() => import("./pages/StudentJobDetail"));
const JobAccepted = lazyWithRetry(() => import("./pages/JobAccepted"));
const StudentAccount = lazyWithRetry(() => import("./pages/StudentAccount"));
const JoinAsHelper = lazyWithRetry(() => import("./pages/JoinAsHelper"));
const Partners = lazyWithRetry(() => import("./pages/Partners"));
const Refer = lazyWithRetry(() => import("./pages/Refer"));
const VerifyHelper = lazyWithRetry(() => import("./pages/VerifyHelper"));
const HelperPublicProfile = lazyWithRetry(() => import("./pages/HelperPublicProfile"));
const HouseholdAdmin = lazyWithRetry(() => import("./pages/HouseholdAdmin"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const Cover = lazyWithRetry(() => import("./pages/Cover"));
const HelperTerms = lazyWithRetry(() => import("./pages/HelperTerms"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const ServiceLanding = lazyWithRetry(() => import("./pages/ServiceLanding"));
const BlogIndex = lazyWithRetry(() => import("./pages/BlogIndex"));
const BlogPost = lazyWithRetry(() => import("./pages/BlogPost"));
const GlossaryIndex = lazyWithRetry(() => import("./pages/GlossaryIndex"));
const GlossaryTerm = lazyWithRetry(() => import("./pages/GlossaryTerm"));

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
import { InAppBrowserBanner } from "@/components/InAppBrowserBanner";
import { captureReferralFromUrl } from "@/lib/referral";
import { SERVICE_LANDING_SLUGS } from "@/content/serviceSlugs";
import { isNativeApp } from "@/lib/platform";
import { initNativeApp } from "@/lib/native/initNativeApp";

function getVariant(path: string): TransitionVariant {
  if (path === '/') return 'rise';
  if (path === '/home' || path === '/bookings' || path === '/account' || path === '/join' || path.startsWith('/track/') || path === '/student-dashboard' || path.startsWith('/student-job/') || path === '/accepted') return 'rise';
  if (['/auth', '/helper/profile'].includes(path) || path.startsWith('/helpers/')) return 'rise';
  return 'default';
}

const App = () => {
  const location = useLocation();
  const variant = getVariant(location.pathname);
  const P = ({ children }: { children: React.ReactNode }) => <PageTransition variant={variant}>{children}</PageTransition>;

  useEffect(() => {
    const t = window.setTimeout(() => markChunkLoadRecovered(), 10_000);
    // Friend referral links land with ?ref=CODE — keep it for checkout.
    // NOT on /join: there ?ref is a PARTNER recruiting code (helper-signup
    // attribution, a different code space) — storing it as a customer code
    // showed a false "your friend gave you €5" banner checkout never honours.
    if (window.location.pathname !== '/join') captureReferralFromUrl();
    return () => window.clearTimeout(t);
  }, []);

  // Native (Capacitor) shell only: status bar, splash, OAuth deep links.
  // No-ops on the web — see src/lib/native/initNativeApp.ts.
  useEffect(() => {
    void initNativeApp();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
    <AuthProvider>
    <TooltipProvider>
      <SilentErrorBoundary source="ScrollProgress"><ScrollProgress /></SilentErrorBoundary>
      <SilentErrorBoundary source="ScrollToTop"><ScrollToTop /></SilentErrorBoundary>
      <SilentErrorBoundary source="InAppBrowserBanner"><InAppBrowserBanner /></SilentErrorBoundary>
      <Toaster />
      <Sonner />
      {/* No transform/perspective here: any non-none perspective would make this
          div the containing block for every position:fixed descendant (nav,
          bottom sheets), anchoring them to the page instead of the viewport. */}
      <div>
        <RouteErrorBoundary routeKey={location.pathname}>
        <Suspense fallback={<RouteSuspenseFallback />}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<P><HouseholdHome /></P>} />
            <Route path="/home" element={<P><HouseholdHome /></P>} />
            <Route path="/bookings" element={<P><MyBookings /></P>} />
            <Route path="/account" element={<P><Account /></P>} />
            <Route path="/track/:bookingId" element={<P><TrackBooking /></P>} />
            <Route path="/student-dashboard" element={<P><StudentDashboard /></P>} />
            <Route path="/student-job/:bookingId" element={<P><StudentJobDetail /></P>} />
            <Route path="/accepted" element={<P><JobAccepted /></P>} />
            <Route path="/student-account" element={<P><StudentAccount /></P>} />
            <Route path="/join" element={<P><JoinAsHelper /></P>} />
            <Route path="/partners" element={<P><Partners /></P>} />
            <Route path="/refer" element={<P><Refer /></P>} />
            <Route path="/verify-helper" element={<P><VerifyHelper /></P>} />
            {/* Legacy orphan — nothing links here. Redirect to the live helper
                home instead of rendering the stale HelperProfile page. */}
            <Route path="/helper/profile" element={<Navigate to="/student-account" replace />} />
            <Route path="/helpers/:id" element={<P><HelperPublicProfile /></P>} />
            <Route path="/household-admin" element={<P><HouseholdAdmin /></P>} />
            <Route path="/auth" element={<P><Auth /></P>} />
            <Route path="/privacy" element={<P><Privacy /></P>} />
            <Route path="/terms" element={<P><Terms /></P>} />
            {/* Vano Cover (damage guarantee) + the Helper Agreement & Code of
                Conduct the join consent references — legal surface, like /terms. */}
            <Route path="/cover" element={<P><Cover /></P>} />
            <Route path="/helper-terms" element={<P><HelperTerms /></P>} />
            {/* Per-service SEO landing pages (/cleaning-galway…). Slugs only —
                the copy stays in the lazy ServiceLanding chunk. */}
            {SERVICE_LANDING_SLUGS.map((slug) => (
              <Route key={slug} path={`/${slug}`} element={<P><ServiceLanding /></P>} />
            ))}
            <Route path="/blog" element={<P><BlogIndex /></P>} />
            <Route path="/blog/:slug" element={<P><BlogPost /></P>} />
            <Route path="/glossary" element={<P><GlossaryIndex /></P>} />
            <Route path="/glossary/:slug" element={<P><GlossaryTerm /></P>} />
            <Route path="*" element={<P><NotFound /></P>} />
          </Routes>
        </Suspense>
        </RouteErrorBoundary>
      </div>
      <SilentErrorBoundary source="BottomNav"><BottomNav /></SilentErrorBoundary>
      <Suspense fallback={null}>
        <SilentErrorBoundary source="WhatsAppFloatingButton"><WhatsAppFloatingButton /></SilentErrorBoundary>
        <SilentErrorBoundary source="CookieConsentBanner"><CookieConsentBanner /></SilentErrorBoundary>
        {/* Web-only: "install" / "add to home screen" prompts and the web
            service-worker auto-updater are meaningless (or would hang) inside
            the native app, which updates via the App Store / Play Store. */}
        {!isNativeApp() && (
          <>
            <SilentErrorBoundary source="PWAInstallBanner"><PWAInstallBanner /></SilentErrorBoundary>
            <SilentErrorBoundary source="PushNotificationPrompt"><PushNotificationPrompt /></SilentErrorBoundary>
            <SilentErrorBoundary source="PwaUpdateToast"><PwaUpdateToast /></SilentErrorBoundary>
          </>
        )}
      </Suspense>
    </TooltipProvider>
    </AuthProvider>
    </MotionConfig>
  );
};

export default App;
