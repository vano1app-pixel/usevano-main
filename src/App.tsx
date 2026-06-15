import React, { lazy, Suspense, useEffect } from "react";
import { lazyWithRetry, markChunkLoadRecovered } from "@/lib/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, useLocation } from "react-router-dom";
import { PageTransition } from "@/components/PageTransition";
import { ScrollProgress } from "@/components/ScrollProgress";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteSuspenseFallback } from "@/components/RouteSuspenseFallback";
import { SilentErrorBoundary } from "@/components/SilentErrorBoundary";
import { AuthProvider } from "@/hooks/useAuthContext";
import { ScrollToTop } from "@/components/ScrollToTop";

const HouseholdHome = lazyWithRetry(() => import("./pages/HouseholdHome"));
const BookingFlow = lazyWithRetry(() => import("./pages/BookingFlow"));
const TrackBooking = lazyWithRetry(() => import("./pages/TrackBooking"));
const StudentDashboard = lazyWithRetry(() => import("./pages/StudentDashboard"));
const StudentJobDetail = lazyWithRetry(() => import("./pages/StudentJobDetail"));
const JobAccepted = lazyWithRetry(() => import("./pages/JobAccepted"));
const StudentAccount = lazyWithRetry(() => import("./pages/StudentAccount"));
const JoinAsHelper = lazyWithRetry(() => import("./pages/JoinAsHelper"));
const HelperProfile = lazyWithRetry(() => import("./pages/HelperProfile"));
const HelperPublicProfile = lazyWithRetry(() => import("./pages/HelperPublicProfile"));
const HouseholdAdmin = lazyWithRetry(() => import("./pages/HouseholdAdmin"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const Privacy = lazyWithRetry(() => import("./pages/Privacy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));

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

function getVariant(path: string): TransitionVariant {
  if (path === '/') return 'rise';
  if (path === '/home' || path === '/join' || path.startsWith('/book/') || path.startsWith('/track/') || path === '/student-dashboard' || path.startsWith('/student-job/') || path === '/accepted') return 'rise';
  if (['/auth', '/helper/profile'].includes(path) || path.startsWith('/helpers/')) return 'rise';
  return 'default';
}

const App = () => {
  const location = useLocation();
  const variant = getVariant(location.pathname);
  const P = ({ children }: { children: React.ReactNode }) => <PageTransition variant={variant}>{children}</PageTransition>;

  useEffect(() => {
    const t = window.setTimeout(() => markChunkLoadRecovered(), 10_000);
    // Friend referral links land with ?ref=CODE — keep it for checkout
    captureReferralFromUrl();
    return () => window.clearTimeout(t);
  }, []);

  return (
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
            <Route path="/book/:category" element={<P><BookingFlow /></P>} />
            <Route path="/track/:bookingId" element={<P><TrackBooking /></P>} />
            <Route path="/student-dashboard" element={<P><StudentDashboard /></P>} />
            <Route path="/student-job/:bookingId" element={<P><StudentJobDetail /></P>} />
            <Route path="/accepted" element={<P><JobAccepted /></P>} />
            <Route path="/student-account" element={<P><StudentAccount /></P>} />
            <Route path="/join" element={<P><JoinAsHelper /></P>} />
            <Route path="/helper/profile" element={<P><HelperProfile /></P>} />
            <Route path="/helpers/:id" element={<P><HelperPublicProfile /></P>} />
            <Route path="/household-admin" element={<P><HouseholdAdmin /></P>} />
            <Route path="/auth" element={<P><Auth /></P>} />
            <Route path="/privacy" element={<P><Privacy /></P>} />
            <Route path="/terms" element={<P><Terms /></P>} />
            <Route path="*" element={<P><NotFound /></P>} />
          </Routes>
        </Suspense>
        </RouteErrorBoundary>
      </div>
      <Suspense fallback={null}>
        <SilentErrorBoundary source="WhatsAppFloatingButton"><WhatsAppFloatingButton /></SilentErrorBoundary>
        <SilentErrorBoundary source="CookieConsentBanner"><CookieConsentBanner /></SilentErrorBoundary>
        <SilentErrorBoundary source="PWAInstallBanner"><PWAInstallBanner /></SilentErrorBoundary>
        <SilentErrorBoundary source="PushNotificationPrompt"><PushNotificationPrompt /></SilentErrorBoundary>
        <SilentErrorBoundary source="PwaUpdateToast"><PwaUpdateToast /></SilentErrorBoundary>
      </Suspense>
    </TooltipProvider>
    </AuthProvider>
  );
};

export default App;
