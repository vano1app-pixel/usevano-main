import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PageTransition } from "@/components/PageTransition";
import { ScrollProgress } from "@/components/ScrollProgress";

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

// Floating/ambient UI — none are needed for first paint, so defer them via
// Suspense. Failure to load any of these should degrade silently (fallback={null}).
const MascotGuide = lazy(() =>
  import("@/components/MascotGuide").then((m) => ({ default: m.MascotGuide })),
);
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

// Route-level Suspense boundary intentionally uses `fallback={null}` below:
// the PageTransition AnimatePresence already provides a smooth swap, and
// showing a full-screen spinner for the ~100-300ms chunk fetch made the site
// feel janky. The brief blank frame is imperceptible on fast networks and
// more tolerable on slow ones than a pop-in spinner.

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
        <Suspense fallback={null}>
          <Routes location={location} key={location.pathname}>
            <Route path="/" element={<P><Landing /></P>} />
            <Route path="/hire" element={<P><HirePage /></P>} />
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
            <Route path="/u/:slug" element={<P><UserSlugRedirect /></P>} />
            <Route path="/blog/vano-v1" element={<P><BlogPost /></P>} />
            <Route path="/privacy" element={<P><Privacy /></P>} />
            <Route path="/terms" element={<P><Terms /></P>} />
            <Route path="*" element={<P><NotFound /></P>} />
          </Routes>
        </Suspense>
      </div>
      <MobileBottomNav />
      {/* Floating/ambient UI — deferred, fallback silently on load failure */}
      <Suspense fallback={null}>
        <MascotGuide />
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
