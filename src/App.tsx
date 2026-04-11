import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { PwaUpdateToast } from "@/components/PwaUpdateToast";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { PageTransition } from "@/components/PageTransition";
import { ScrollProgress } from "@/components/ScrollProgress";
import { MascotGuide } from "@/components/MascotGuide";

import { RequireVerifiedSession } from "@/components/RequireVerifiedSession";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RedirectToAccountTypeIfNeeded } from "@/components/RedirectToAccountTypeIfNeeded";
import Landing from "./pages/Landing";
import JobDetail from "./pages/JobDetail";
import HirePage from "./pages/HirePage";
import BrowseStudents from "./pages/BrowseStudents";
import StudentsByCategory from "./pages/StudentsByCategory";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import StudentProfilePage from "./pages/StudentProfile";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

import CompleteProfile from "./pages/CompleteProfile";
import ChooseAccountType from "./pages/ChooseAccountType";
import Admin from "./pages/Admin";
import BusinessDashboard from "./pages/BusinessDashboard";
import BlogPost from "./pages/BlogPost";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import UserSlugRedirect from "./pages/UserSlugRedirect";
import { WhatsAppFloatingButton } from "./components/WhatsAppFloatingButton";
import type { TransitionVariant } from "./components/PageTransition";

function getVariant(path: string): TransitionVariant {
  if (path === '/') return 'liquid';
  if (path === '/hire') return 'dissolve';
  if (['/auth', '/choose-account-type', '/complete-profile', '/profile', '/business-dashboard', '/messages'].includes(path)) return 'rise';
  if (path.startsWith('/students') || path.startsWith('/jobs/')) return 'morph';
  return 'default';
}

const App = () => {
  const location = useLocation();
  const variant = getVariant(location.pathname);
  const P = ({ children }: { children: React.ReactNode }) => <PageTransition variant={variant}>{children}</PageTransition>;

  return (
    <TooltipProvider>
      <ScrollProgress />
      <ScrollToTop />
      <RedirectToAccountTypeIfNeeded />
      <Toaster />
      <Sonner />
      <div className="md:pt-14 lg:pt-16" style={{ perspective: '1200px' }}>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<P><Landing /></P>} />
          <Route path="/hire" element={<P><HirePage /></P>} />
          <Route path="/jobs/:id" element={<P><JobDetail /></P>} />
          <Route path="/students" element={<P><BrowseStudents /></P>} />
          <Route path="/students/videography"  element={<P><StudentsByCategory categoryId="videography" /></P>} />
          <Route path="/students/photography"  element={<P><StudentsByCategory categoryId="photography" /></P>} />
          <Route path="/students/websites"     element={<P><StudentsByCategory categoryId="websites" /></P>} />
          <Route path="/students/social_media" element={<P><StudentsByCategory categoryId="social_media" /></P>} />
          <Route path="/students/:id" element={<P><StudentProfilePage /></P>} />
          <Route
            path="/profile"
            element={
              <RequireVerifiedSession>
                <P><Profile /></P>
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
      </AnimatePresence>
      </div>
      <MobileBottomNav />
      <MascotGuide />
      <WhatsAppFloatingButton />
      <CookieConsentBanner />
      <PWAInstallBanner />
      <PushNotificationPrompt />
      <PwaUpdateToast />
    </TooltipProvider>
  );
};

export default App;
