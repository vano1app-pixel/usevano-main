import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route } from "react-router-dom";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { PwaUpdateToast } from "@/components/PwaUpdateToast";

import { RequireVerifiedSession } from "@/components/RequireVerifiedSession";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RedirectToAccountTypeIfNeeded } from "@/components/RedirectToAccountTypeIfNeeded";
import Landing from "./pages/Landing";
import BrowseJobs from "./pages/BrowseJobs";
import JobDetail from "./pages/JobDetail";
import PostJob from "./pages/PostJob";
import BrowseStudents from "./pages/BrowseStudents";
import StudentsByCategory from "./pages/StudentsByCategory";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import StudentProfilePage from "./pages/StudentProfile";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Community from "./pages/Community";
import Portfolio from "./pages/Portfolio";

import CompleteProfile from "./pages/CompleteProfile";
import ChooseAccountType from "./pages/ChooseAccountType";
import Admin from "./pages/Admin";
import BlogPost from "./pages/BlogPost";
import WhatsNew from "./pages/WhatsNew";
import UserSlugRedirect from "./pages/UserSlugRedirect";

const App = () => (
  <TooltipProvider>
    <ScrollToTop />
    <RedirectToAccountTypeIfNeeded />
    <Toaster />
    <Sonner />
    <div className="md:pt-14 lg:pt-16">
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/jobs" element={<BrowseJobs />} />
      <Route path="/jobs/:id" element={<JobDetail />} />
      <Route
        path="/post-job"
        element={
          <RequireVerifiedSession>
            <PostJob />
          </RequireVerifiedSession>
        }
      />
      <Route path="/students" element={<BrowseStudents />} />
      <Route path="/students/videography"  element={<StudentsByCategory categoryId="videography" />} />
      <Route path="/students/photography"  element={<StudentsByCategory categoryId="photography" />} />
      <Route path="/students/websites"     element={<StudentsByCategory categoryId="websites" />} />
      <Route path="/students/social_media" element={<StudentsByCategory categoryId="social_media" />} />
      <Route path="/students/:id" element={<StudentProfilePage />} />
      <Route
        path="/profile"
        element={
          <RequireVerifiedSession>
            <Profile />
          </RequireVerifiedSession>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireVerifiedSession>
            <Profile />
          </RequireVerifiedSession>
        }
      />
      <Route
        path="/messages"
        element={
          <RequireVerifiedSession>
            <Messages />
          </RequireVerifiedSession>
        }
      />
      <Route path="/auth" element={<Auth />} />
      <Route
        path="/choose-account-type"
        element={
          <RequireVerifiedSession>
            <ChooseAccountType />
          </RequireVerifiedSession>
        }
      />
      <Route
        path="/complete-profile"
        element={
          <RequireVerifiedSession>
            <CompleteProfile />
          </RequireVerifiedSession>
        }
      />
      <Route path="/community" element={<Community />} />
      <Route
        path="/admin"
        element={
          <RequireVerifiedSession>
            <Admin />
          </RequireVerifiedSession>
        }
      />
      <Route path="/portfolio/:userId" element={<Portfolio />} />
      <Route path="/u/:slug" element={<UserSlugRedirect />} />
      <Route path="/blog/vano-v1" element={<BlogPost />} />
      <Route path="/whats-new" element={<WhatsNew />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    </div>
    <MobileBottomNav />
    <PWAInstallBanner />
    <PushNotificationPrompt />
    <PwaUpdateToast />
  </TooltipProvider>
);

export default App;
