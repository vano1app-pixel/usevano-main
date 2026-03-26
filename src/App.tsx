import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route } from "react-router-dom";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";

import { RequireVerifiedSession } from "@/components/RequireVerifiedSession";
import Landing from "./pages/Landing";
import BrowseJobs from "./pages/BrowseJobs";
import JobDetail from "./pages/JobDetail";
import PostJob from "./pages/PostJob";
import BrowseStudents from "./pages/BrowseStudents";
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import StudentProfilePage from "./pages/StudentProfile";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Community from "./pages/Community";
import Portfolio from "./pages/Portfolio";

import ResetPassword from "./pages/ResetPassword";
import CompleteProfile from "./pages/CompleteProfile";
import ChooseAccountType from "./pages/ChooseAccountType";
import Admin from "./pages/Admin";
import BlogPost from "./pages/BlogPost";

const App = () => (
  <TooltipProvider>
    <Toaster />
    <Sonner />
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

      <Route path="/reset-password" element={<ResetPassword />} />
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
      <Route path="/blog/vano-v1" element={<BlogPost />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
    <MobileBottomNav />
    <PWAInstallBanner />
    <PushNotificationPrompt />
    
  </TooltipProvider>
);

export default App;
