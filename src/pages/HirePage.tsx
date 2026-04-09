import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { StudentCard } from '@/components/StudentCard';
import { useToast } from '@/hooks/use-toast';
import { isEmailVerified } from '@/lib/authSession';
import { teamWhatsAppHref, TEAM_PHONE_DISPLAY } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Sparkles, MessageCircle, Send,
  Video, Camera, Monitor, Megaphone, HelpCircle,
  Clock, Loader2, CheckCircle2, Phone,
} from 'lucide-react';

/* ─── Constants ─── */

const CATEGORIES = [
  { id: 'videography', label: 'Video', icon: Video, keywords: ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo'] },
  { id: 'photography', label: 'Photo', icon: Camera, keywords: ['photo', 'photography', 'photographer', 'portrait', 'headshot', 'lightroom', 'product photo', 'brand photo'] },
  { id: 'websites', label: 'Website', icon: Monitor, keywords: ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify'] },
  { id: 'social_media', label: 'Social Media', icon: Megaphone, keywords: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy'] },
  { id: 'other', label: 'Other', icon: HelpCircle, keywords: [] },
] as const;

const TIMELINES = [
  { id: 'this_week', label: 'This week' },
  { id: '2_weeks', label: '2 weeks' },
  { id: '1_month', label: '1 month' },
  { id: 'flexible', label: 'Flexible' },
] as const;

const BUDGETS = [
  { id: 'under_100', label: 'Under €100' },
  { id: '100_250', label: '€100–250' },
  { id: '250_500', label: '€250–500' },
  { id: '500_plus', label: '€500+' },
  { id: 'unsure', label: 'Not sure' },
] as const;

const CATEGORY_STARTERS: Record<string, string> = {
  videography: 'I need a video for ',
  photography: 'I need photos for ',
  websites: 'I need a website for ',
  social_media: 'I need help with social media for ',
  other: '',
};

/* Budget range to numeric for matching */
const BUDGET_TO_RANGE: Record<string, { min: number; max: number }> = {
  under_100: { min: 0, max: 100 },
  '100_250': { min: 100, max: 250 },
  '250_500': { min: 250, max: 500 },
  '500_plus': { min: 500, max: 9999 },
  unsure: { min: 0, max: 9999 },
};

/* ─── Animations ─── */

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 80 : -80, opacity: 0 }),
};

/* ─── Component ─── */

const HirePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Steps: 1 = describe, 2 = when/budget, 3 = results
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Form state
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(searchParams.get('category'));
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);

  // Results state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matchedStudents, setMatchedStudents] = useState<any[]>([]);
  const [matchedProfiles, setMatchedProfiles] = useState<Record<string, { name: string; avatar: string }>>({});
  const [matchedReviews, setMatchedReviews] = useState<Record<string, { avg: string; count: number }>>({});
  const [matchLoading, setMatchLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Pre-fill from query param
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat && CATEGORIES.some(c => c.id === cat)) {
      setCategory(cat);
      if (!description) setDescription(CATEGORY_STARTERS[cat] || '');
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const goForward = () => { setDirection(1); setStep(s => Math.min(s + 1, 3)); };
  const goBack = () => { setDirection(-1); setStep(s => Math.max(s - 1, 1)); };

  const handleCategoryPick = (id: string) => {
    setCategory(id);
    if (!description.trim() || Object.values(CATEGORY_STARTERS).some(s => description === s)) {
      setDescription(CATEGORY_STARTERS[id] || '');
    }
  };

  /* ── Matching logic (reused from PostJob) ── */
  const fetchMatches = async () => {
    setMatchLoading(true);
    try {
      const [{ data: studentData }, { data: profileData }] = await Promise.all([
        supabase.from('student_profiles').select('*')
          .eq('is_available', true)
          .eq('community_board_status', 'approved'),
        supabase.from('profiles').select('user_id, display_name, avatar_url'),
      ]);

      const students = studentData || [];
      const profs = profileData || [];
      const catObj = CATEGORIES.find(c => c.id === category);
      const keywords = catObj?.keywords || [];
      const budgetRange = budget ? BUDGET_TO_RANGE[budget] : null;

      let matched: any[];
      if (keywords.length > 0) {
        matched = students.filter(s => {
          const skills = (s.skills || []).map((sk: string) => sk.toLowerCase());
          const hasSkillOverlap = skills.some((skill: string) =>
            keywords.some(kw => skill.includes(kw))
          );
          if (!hasSkillOverlap) return false;

          if (budgetRange && s.typical_budget_min != null && s.typical_budget_max != null) {
            if (budgetRange.max < s.typical_budget_min || budgetRange.min > s.typical_budget_max) return false;
          }
          return true;
        });
        if (matched.length === 0) matched = students;
      } else {
        matched = students;
      }

      setMatchedStudents(matched);

      const profMap: Record<string, { name: string; avatar: string }> = {};
      profs.forEach((p: any) => { profMap[p.user_id] = { name: p.display_name, avatar: p.avatar_url || '' }; });
      setMatchedProfiles(profMap);

      if (matched.length > 0) {
        const ids = matched.map((s: any) => s.user_id);
        const { data: revData } = await supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', ids);
        if (revData && revData.length > 0) {
          const map: Record<string, { sum: number; count: number }> = {};
          for (const r of revData) {
            if (!map[r.reviewee_id]) map[r.reviewee_id] = { sum: 0, count: 0 };
            map[r.reviewee_id].sum += r.rating;
            map[r.reviewee_id].count += 1;
          }
          const result: Record<string, { avg: string; count: number }> = {};
          for (const [uid, { sum, count }] of Object.entries(map)) {
            result[uid] = { avg: (sum / count).toFixed(1), count };
          }
          setMatchedReviews(result);
        }
      }
    } catch {
      // silent
    }
    setMatchLoading(false);
  };

  /* ── Submit "Let Vano Handle It" ── */
  const handleVanoSubmit = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!isEmailVerified({ user } as any)) {
      toast({ title: 'Please verify your email first', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('hire_requests' as any).insert({
      requester_id: user.id,
      description,
      category,
      budget_range: budget,
      timeline,
      status: 'pending',
    } as any);

    if (error) {
      toast({ title: 'Something went wrong', description: 'Please try again or message us on WhatsApp.', variant: 'destructive' });
    } else {
      setSubmitted(true);
      // Notify team via edge function (fire & forget)
      supabase.functions.invoke('notify-hire-request', {
        body: { description, category, budget_range: budget, timeline, requester_email: user.email },
      }).catch(() => {});
    }
    setSubmitting(false);
  };

  /* ── Navigate to messages with pre-filled draft ── */
  const messageFreelancer = (freelancerUserId: string) => {
    if (!user) { navigate('/auth'); return; }
    const budgetLabel = BUDGETS.find(b => b.id === budget)?.label || '';
    const timelineLabel = TIMELINES.find(t => t.id === timeline)?.label || '';
    const draft = `Hi! I'm looking for help with: ${description.trim()}${budgetLabel ? ` | Budget: ${budgetLabel}` : ''}${timelineLabel ? ` | Timeline: ${timelineLabel}` : ''}`;
    navigate(`/messages?with=${freelancerUserId}&draft=${encodeURIComponent(draft)}`);
  };

  // When entering step 3, fetch matches
  useEffect(() => {
    if (step === 3) fetchMatches();
  }, [step]);

  const canProceedStep1 = description.trim().length >= 5;
  const canProceedStep2 = !!timeline && !!budget;

  const stepLabel = `Step ${step} of 3`;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead title="Hire a Freelancer – VANO" description="Tell us what you need and get matched with the right freelancer in seconds." />
      <Navbar />

      <div className="mx-auto max-w-2xl px-4 pt-20 sm:px-6 sm:pt-24 md:px-8">
        {/* Progress dots */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                s === step ? 'w-8 bg-primary' : s < step ? 'w-2 bg-primary/40' : 'w-2 bg-muted-foreground/20'
              )}
            />
          ))}
        </div>

        <AnimatePresence custom={direction} mode="wait">
          {/* ══════════ STEP 1: What do you need? ══════════ */}
          {step === 1 && (
            <motion.div
              key="step1"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <header className="mb-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{stepLabel}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  What do you need done?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Just describe it in your own words — like texting a friend.
                </p>
              </header>

              {/* Category chips */}
              <div className="flex flex-wrap gap-2 mb-5">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon;
                  const active = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryPick(cat.id)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.97]',
                        active
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                      )}
                    >
                      <Icon size={14} />
                      {cat.label}
                    </button>
                  );
                })}
              </div>

              {/* Description textarea */}
              <div className="rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. I need a 30-second promo video for my cafe's Instagram..."
                  className="w-full min-h-[140px] resize-y bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  autoFocus
                />
              </div>

              <button
                type="button"
                onClick={goForward}
                disabled={!canProceedStep1}
                className={cn(
                  'mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all active:scale-[0.97]',
                  canProceedStep1
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:brightness-110'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                Continue <ArrowRight size={15} />
              </button>
            </motion.div>
          )}

          {/* ══════════ STEP 2: When & Budget ══════════ */}
          {step === 2 && (
            <motion.div
              key="step2"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={goBack}
                className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
              >
                <ArrowLeft size={14} /> Back
              </button>

              <header className="mb-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{stepLabel}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  When & how much?
                </h1>
              </header>

              {/* Brief summary */}
              <div className="mb-6 rounded-2xl border border-foreground/10 bg-muted/30 p-4">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Your brief</p>
                <p className="text-sm text-foreground leading-relaxed line-clamp-3">{description}</p>
              </div>

              {/* Timeline */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Clock size={15} className="text-muted-foreground" /> When do you need it?
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {TIMELINES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTimeline(t.id)}
                      className={cn(
                        'rounded-xl border px-4 py-3 text-sm font-medium transition-all active:scale-[0.97]',
                        timeline === t.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:border-primary/40'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-foreground mb-3">What's your budget?</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BUDGETS.map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBudget(b.id)}
                      className={cn(
                        'rounded-xl border px-4 py-3 text-sm font-medium transition-all active:scale-[0.97]',
                        budget === b.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:border-primary/40'
                      )}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={goForward}
                disabled={!canProceedStep2}
                className={cn(
                  'mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all active:scale-[0.97]',
                  canProceedStep2
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:brightness-110'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                )}
              >
                See my options <ArrowRight size={15} />
              </button>
            </motion.div>
          )}

          {/* ══════════ STEP 3: Results ══════════ */}
          {step === 3 && (
            <motion.div
              key="step3"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <button
                type="button"
                onClick={goBack}
                className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
              >
                <ArrowLeft size={14} /> Back
              </button>

              <header className="mb-6">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{stepLabel}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  How would you like to hire?
                </h1>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Choose the path that works best for you.
                </p>
              </header>

              {/* ── Option A: Let Vano Handle It ── */}
              {!submitted ? (
                <div className="mb-5 overflow-hidden rounded-2xl border-2 border-primary shadow-md">
                  <div className="bg-primary px-5 py-5">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles size={18} className="text-white" />
                      <h2 className="text-lg font-bold text-white">Let Vano handle it</h2>
                    </div>
                    <p className="text-sm leading-relaxed text-white/80">
                      We personally find and vet the right freelancer for your project. Just sit back.
                    </p>
                  </div>
                  <div className="space-y-3 bg-primary/90 px-5 pb-5 pt-4">
                    <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/60">Our fee</p>
                      <p className="mt-0.5 text-base font-bold text-white">0% commission</p>
                      <p className="mt-0.5 text-xs text-white/60">You only pay the freelancer directly — no hidden costs.</p>
                    </div>

                    {/* Brief summary */}
                    <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-1">Your request</p>
                      <p className="text-xs text-white/80 line-clamp-2">{description}</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {category && (
                          <span className="inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80">
                            {CATEGORIES.find(c => c.id === category)?.label}
                          </span>
                        )}
                        {timeline && (
                          <span className="inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80">
                            {TIMELINES.find(t => t.id === timeline)?.label}
                          </span>
                        )}
                        {budget && (
                          <span className="inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80">
                            {BUDGETS.find(b => b.id === budget)?.label}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleVanoSubmit}
                      disabled={submitting}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-primary shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98]"
                    >
                      {submitting ? (
                        <><Loader2 size={15} className="animate-spin" /> Sending...</>
                      ) : (
                        <><Send size={15} /> Submit request</>
                      )}
                    </button>
                    <p className="text-center text-[11px] text-white/50">Free consultation · No commitment · Expect a match within 24hrs</p>
                  </div>
                </div>
              ) : (
                /* ── Success state ── */
                <div className="mb-5 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
                  <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-500" />
                  <h2 className="text-lg font-bold text-foreground">Request submitted!</h2>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    We're reviewing your request and will match you with the best freelancer. Expect to hear from us within 24 hours.
                  </p>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
                    <a
                      href={teamWhatsAppHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/20"
                    >
                      <MessageCircle size={15} /> Chat with us on WhatsApp
                    </a>
                  </div>
                </div>
              )}

              {/* ── Divider ── */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs font-medium text-muted-foreground">or hire directly</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* ── Option B: Browse & Message Directly ── */}
              <div className="rounded-2xl border border-foreground/10 bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <MessageCircle size={18} className="text-muted-foreground" />
                  <h2 className="text-base font-semibold text-foreground">Message freelancers directly</h2>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Browse matching freelancers and message them with your brief pre-filled. Faster if you want to compare.
                </p>

                {matchLoading ? (
                  <div className="flex flex-col gap-4" aria-busy aria-label="Finding matches">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm animate-pulse">
                        <div className="h-36 w-full bg-muted/60" />
                        <div className="p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
                            <div className="flex-1 space-y-2">
                              <div className="h-3.5 w-32 rounded-md bg-muted" />
                              <div className="h-2.5 w-24 rounded-md bg-muted" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : matchedStudents.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {matchedStudents.slice(0, 6).map((student, idx) => {
                      const ratingInfo = matchedReviews[student.user_id];
                      return (
                        <div key={student.id}>
                          <div
                            className="animate-fade-in opacity-0"
                            style={{ animationDelay: `${idx * 60}ms` }}
                          >
                            <StudentCard
                              student={student}
                              displayName={matchedProfiles[student.user_id]?.name || 'Freelancer'}
                              profileAvatarUrl={matchedProfiles[student.user_id]?.avatar || null}
                              showFavourite={false}
                              avgRating={ratingInfo?.avg ?? null}
                              reviewCount={ratingInfo?.count}
                            />
                          </div>
                          {/* Message button below each card */}
                          <button
                            type="button"
                            onClick={() => messageFreelancer(student.user_id)}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10 active:scale-[0.98]"
                          >
                            <MessageCircle size={14} /> Message with your brief
                          </button>
                        </div>
                      );
                    })}

                    {matchedStudents.length > 6 && (
                      <button
                        type="button"
                        onClick={() => navigate('/students')}
                        className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
                      >
                        View all {matchedStudents.length} freelancers <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">No matches found right now.</p>
                    <button
                      type="button"
                      onClick={() => navigate('/students')}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      Browse all freelancers <ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default HirePage;
