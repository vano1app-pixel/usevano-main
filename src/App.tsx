import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Routes, Route, Navigate } from "react-router-dom";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { PWAInstallBanner } from "@/components/PWAInstallBanner";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";

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
      <Route path="/post-job" element={<PostJob />} />
      <Route path="/students" element={<BrowseStudents />} />
      <Route path="/students/:id" element={<StudentProfilePage />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/dashboard" element={<Navigate to="/profile" replace />} />
      <Route path="/messages" element={<Messages />} />
      <Route path="/auth" element={<Auth />} />
      
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route path="/community" element={<Community />} />
      <Route path="/admin" element={<Admin />} />
      
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
