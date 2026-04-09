import React, { useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { motion } from 'framer-motion';
import { ArrowLeft, Target, LayoutDashboard, Trophy, MessageCircle, Shield, Users, Calendar, Briefcase, Image, CheckCheck, Bell, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const features = [
  {
    icon: Target,
    title: 'Better gig matching',
    description: 'See roles that line up with your skills and preferences first — less noise, clearer choices when you browse open work.',
    tag: 'Matching',
  },
  {
    icon: LayoutDashboard,
    title: 'Application Tracking Board',
    description: 'A visual Kanban board that lets you track every application from "Applied" through "Accepted," "In Progress," "Completed," and "Paid." Always know where you stand at a glance.',
    tag: 'Dashboard',
  },
  {
    icon: Trophy,
    title: 'Expanded Achievement System',
    description: 'Earn badges like "5-Star Streak," "Quick Responder," "Top Earner," and "Community Star." Animated reveals celebrate your milestones, and badges show up on your profile for everyone to see.',
    tag: 'Gamification',
  },
  {
    icon: MessageCircle,
    title: 'Enhanced Real-Time Chat',
    description: 'Typing indicators show when the other person is writing. Read receipts (✓✓) confirm your message was seen. Share images directly in conversations. A subtle notification sound keeps you in the loop.',
    tag: 'Communication',
  },
  {
    icon: Shield,
    title: 'MOD Badge System',
    description: 'Admins and moderators now display a distinctive animated MOD badge across the platform — making it easy to identify trusted community leaders.',
    tag: 'Trust',
  },
  {
    icon: Users,
    title: 'Community Networking Page',
    description: 'A dedicated space to connect with fellow freelancers, browse talent and the community board, and build relationships beyond individual gigs.',
    tag: 'Community',
  },
  {
    icon: Calendar,
    title: 'Events Platform',
    description: 'Create and discover local events, register with one click, and see live countdown timers. Businesses can host meetups, workshops, and networking sessions.',
    tag: 'Events',
  },
  {
    icon: Image,
    title: 'Portfolio Showcase',
    description: 'Build a visual portfolio with images and descriptions of your best work. Shareable profiles let you show potential clients exactly what you can do.',
    tag: 'Portfolio',
  },
  {
    icon: Briefcase,
    title: 'Job Preferences & Instant Alerts',
    description: 'Set your preferred work types, budget range, and skill tags. When a matching gig is posted, you get notified instantly — never miss an opportunity.',
    tag: 'Matching',
  },
  {
    icon: CheckCheck,
    title: 'Shift Confirmation & Payment Tracking',
    description: 'Both parties confirm shifts before and after completion. Track payments with clear "paid" / "unpaid" statuses so nothing falls through the cracks.',
    tag: 'Payments',
  },
  {
    icon: Bell,
    title: 'Real-Time Notifications',
    description: 'Stay updated with in-app notifications for new matches, application updates, messages, and platform announcements — all delivered in real time.',
    tag: 'Notifications',
  },
];

const BlogPost = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-background pb-16 md:pb-0">
      <SEOHead
        title="VANO v1.5 — What's New"
        description="Introducing VANO v1.5: smoother UI, Google sign-in, verified Community listings, and faster performance."
        keywords="vano, v1.5, changelog, update, features, galway, freelance"
      />
      <Navbar />

      <article className="max-w-3xl mx-auto px-4 pt-8 pb-16">
        {/* Back */}
        <motion.button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <ArrowLeft size={16} /> Back to Home
        </motion.button>

        {/* Header */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.5 }}
        >
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 hover:bg-primary/15">
            v1.5 Release
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground tracking-tight mb-4 leading-tight">
            Introducing VANO v1.5
          </h1>
          <p className="text-lg text-muted-foreground mb-2">
            Smoother UI everywhere, Google sign-in, a moderated Community board with verified student profiles, and faster loading across the app.
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-10">
            <time>March 8, 2026</time>
            <span>·</span>
            <span>5 min read</span>
          </div>
        </motion.div>

        {/* Intro */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="prose prose-sm max-w-none mb-12"
        >
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 mb-8">
            <p className="text-foreground leading-relaxed m-0">
              Since we launched VANO, our mission has been simple: <strong>make it effortless for Galway businesses and freelancers to find each other</strong>. With v1.5 we focus on polish and trust: a smoother interface on every screen, optional Google login, Community listings that only show verified freelancers after review, and performance improvements so the app loads faster on real devices.
            </p>
          </div>
        </motion.div>

        {/* Features */}
        <div className="space-y-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              variants={fadeUp}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-6 hover:border-primary/15 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 group-hover:bg-primary/12 transition-colors">
                  <feature.icon size={20} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-primary/60 bg-primary/8 px-2 py-0.5 rounded-full">{feature.tag}</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* What's Next */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
          className="mt-12 bg-primary/5 border border-primary/10 rounded-2xl p-6"
        >
          <h2 className="text-lg font-bold text-foreground mb-2">What's next?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We're just getting started. Upcoming features include in-app payments, advanced analytics for businesses, skill verification badges, and expanding beyond Galway. Stay tuned — and keep the feedback coming.
          </p>
        </motion.div>

        {/* Author */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
          className="mt-12 border-t border-border pt-8"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">From the team</p>
          <div>
            <p className="font-semibold text-foreground">VANO Team</p>
            <p className="text-sm text-muted-foreground">Product &amp; community at VANO</p>
          </div>
        </motion.div>

        {/* Feedback */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
          className="mt-12 bg-card border border-border rounded-2xl p-6"
        >
          <h2 className="text-lg font-bold text-foreground mb-2">Share your feedback</h2>
          <p className="text-sm text-muted-foreground mb-4">Let us know what you think about VANO v1.5 — we read every message.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!feedbackMsg.trim()) return;
              setSubmitting(true);
              const { data: { session } } = await supabase.auth.getSession();
              if (!session) {
                toast({ title: 'Please sign in', description: 'You need to be logged in to send feedback.', variant: 'destructive' });
                setSubmitting(false);
                return;
              }
              const { error } = await supabase.from('feedback').insert({ user_id: session.user.id, message: feedbackMsg.trim() } as any);
              if (error) {
                toast({ title: 'Error', description: 'Could not send feedback. Try again.', variant: 'destructive' });
              } else {
                toast({ title: 'Thank you!', description: 'Your feedback has been sent.' });
                setFeedbackMsg('');
              }
              setSubmitting(false);
            }}
            className="flex gap-2"
          >
            <input
              value={feedbackMsg}
              onChange={(e) => setFeedbackMsg(e.target.value)}
              placeholder="What do you think?"
              maxLength={500}
              className="flex-1 border border-input rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={submitting || !feedbackMsg.trim()}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              <Send size={14} /> Send
            </button>
          </form>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          transition={{ duration: 0.5 }}
          className="mt-12 text-center"
        >
          <button
            onClick={() => navigate('/jobs')}
            className="px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-all shadow-[0_2px_16px_hsl(var(--primary)/0.25)]"
          >
            Start exploring VANO v1.5 →
          </button>
        </motion.div>
      </article>
    </div>
  );
};

export default BlogPost;
