import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import confetti from 'canvas-confetti';
import { StudentCard } from '@/components/StudentCard';
import { useToast } from '@/hooks/use-toast';
import { isEmailVerified } from '@/lib/authSession';
import { teamWhatsAppHref } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Sparkles, MessageCircle, Send,
  Video, Camera, Monitor, Megaphone, HelpCircle,
  Clock, Loader2, CheckCircle2, Euro,
  Shield, Zap, ChevronDown, Check,
} from 'lucide-react';
import { useParticleBurst } from '@/hooks/useParticleBurst';
import { JourneyMap, HIRE_JOURNEY_STEPS } from '@/components/JourneyMap';

/* ─── Constants ─── */

const CATEGORIES = [
  { id: 'videography', label: 'Video', icon: Video, starter: 'I need a video for ', keywords: ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo'] },
  { id: 'photography', label: 'Photo', icon: Camera, starter: 'I need photos for ', keywords: ['photo', 'photography', 'photographer', 'portrait', 'headshot', 'lightroom', 'product photo', 'brand photo'] },
  { id: 'websites', label: 'Website', icon: Monitor, starter: 'I need a website for ', keywords: ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify'] },
  { id: 'social_media', label: 'Social Media', icon: Megaphone, starter: 'I need help with social media for ', keywords: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy'] },
  { id: 'other', label: 'Other', icon: HelpCircle, starter: '', keywords: [] },
] as const;

const TIMELINES = [
  { id: 'this_week', label: 'This week', sub: 'Rush job' },
  { id: '2_weeks', label: '2 weeks', sub: 'Standard' },
  { id: '1_month', label: '1 month', sub: 'No rush' },
  { id: 'flexible', label: 'Flexible', sub: 'Whenever' },
] as const;

const BUDGETS = [
  { id: 'under_100', label: 'Under €100', sub: 'Small task' },
  { id: '100_250', label: '€100–250', sub: 'Most popular' },
  { id: '250_500', label: '€250–500', sub: 'Bigger project' },
  { id: '500_plus', label: '€500+', sub: 'Full project' },
  { id: 'unsure', label: 'Not sure yet', sub: "We'll advise" },
] as const;

const BUDGET_TO_RANGE: Record<string, { min: number; max: number }> = {
  under_100: { min: 0, max: 100 },
  '100_250': { min: 100, max: 250 },
  '250_500': { min: 250, max: 500 },
  '500_plus': { min: 500, max: 9999 },
  unsure: { min: 0, max: 9999 },
};

const PRICING_PACKAGES = [
  {
    name: 'Social Media',
    price: '249',
    period: '/mo',
    features: [
      'Content calendar & strategy',
      '12 posts per month',
      'Community engagement',
      'Monthly performance report',
    ],
  },
  {
    name: 'Website Build',
    price: '499',
    period: ' one-off',
    popular: true,
    features: [
      'Custom responsive design',
      'Up to 5 pages',
      'SEO setup',
      'Contact form & analytics',
    ],
  },
  {
    name: 'Content Bundle',
    price: '349',
    period: '/mo',
    features: [
      'Professional photo shoot',
      'Short-form video content',
      'Editing & post-production',
      'Brand-ready deliverables',
    ],
  },
];

/* ─── Component ─── */

const isMobileHire = typeof window !== 'undefined' && window.innerWidth < 768;

const HirePage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const particleBurst = useParticleBurst();

  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState(1); // 1 = forward, -1 = backward

  // Brief
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(searchParams.get('category'));
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);

  // Results
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matchedStudents, setMatchedStudents] = useState<any[]>([]);
  const [matchedProfiles, setMatchedProfiles] = useState<Record<string, { name: string; avatar: string }>>({});
  const [matchedReviews, setMatchedReviews] = useState<Record<string, { avg: string; count: number }>>({});
  const [matchLoading, setMatchLoading] = useState(false);
  const [showDirectHire, setShowDirectHire] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) {
      const found = CATEGORIES.find(c => c.id === cat);
      if (found) { setCategory(cat); if (!description) setDescription(found.starter); }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const goTo = (s: number) => {
    setStepDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const handleCategoryPick = (id: string) => {
    const cat = CATEGORIES.find(c => c.id === id);
    setCategory(id);
    const starters = CATEGORIES.map(c => c.starter);
    if (!description.trim() || starters.includes(description)) setDescription(cat?.starter || '');
  };

  /* ── Fetch matched freelancers ── */
  const fetchMatches = async () => {
    setMatchLoading(true);
    try {
      const [{ data: studentData }, { data: profileData }] = await Promise.all([
        supabase.from('student_profiles').select('*').eq('is_available', true).eq('community_board_status', 'approved'),
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
          if (!skills.some((skill: string) => keywords.some(kw => skill.includes(kw)))) return false;
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
    } catch { /* silent */ }
    setMatchLoading(false);
  };

  /* ── Submit Vano request ── */
  const handleVanoSubmit = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!isEmailVerified({ user } as any)) {
      toast({ title: 'Please verify your email first', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('hire_requests' as any).insert({
      requester_id: user.id, description, category, budget_range: budget, timeline, status: 'pending',
    } as any);
    if (error) {
      toast({ title: 'Something went wrong', description: 'Please try again or message us on WhatsApp.', variant: 'destructive' });
    } else {
      setSubmitted(true);
      // Celebration confetti burst + particle fireworks
      const end = Date.now() + 600;
      const fire = () => {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'] });
        if (Date.now() < end) requestAnimationFrame(fire);
      };
      fire();
      // Particle firework burst at center
      particleBurst({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }, 'firework', { particleCount: 40 });
      // Auto-open WhatsApp with request details so the team can respond directly
      const catLabel = CATEGORIES.find(c => c.id === category)?.label || 'Not specified';
      const timelineLabel = TIMELINES.find(t => t.id === timeline)?.label || 'Not specified';
      const budgetLabel = BUDGETS.find(b => b.id === budget)?.label || 'Not specified';
      const waLines = [
        `Hi! I just submitted a hire request on VANO.`,
        ``,
        `Project: ${description.trim()}`,
        `Category: ${catLabel}`,
        `Timeline: ${timelineLabel}`,
        `Budget: ${budgetLabel}`,
      ];
      window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(waLines.join('\n'))}`, '_blank');
      supabase.functions.invoke('notify-hire-request', {
        body: { description, category, budget_range: budget, timeline, requester_email: user.email },
      }).catch(() => {});
    }
    setSubmitting(false);
  };

  /* ── Message freelancer with pre-filled draft ── */
  const messageFreelancer = (freelancerUserId: string) => {
    if (!user) { navigate('/auth'); return; }
    const budgetLabel = BUDGETS.find(b => b.id === budget)?.label || '';
    const timelineLabel = TIMELINES.find(t => t.id === timeline)?.label || '';
    const draft = `Hi! I'm looking for help with: ${description.trim()}${budgetLabel ? ` | Budget: ${budgetLabel}` : ''}${timelineLabel ? ` | Timeline: ${timelineLabel}` : ''}`;
    navigate(`/messages?with=${freelancerUserId}&draft=${encodeURIComponent(draft)}`);
  };

  useEffect(() => { if (step === 3) fetchMatches(); }, [step]);

  const canProceedStep1 = description.trim().length >= 5;
  const canProceedStep2 = !!timeline && !!budget;

  /* ── Render helpers ── */

  const renderStep1 = () => (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          What do you need done?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          Describe your project like you'd text a friend. We'll match you with the right person at the right price.
        </p>
      </header>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const active = category === cat.id;
          return (
            <button key={cat.id} type="button" onClick={() => handleCategoryPick(cat.id)} className={cn(
              'flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs sm:text-sm font-medium transition-all cursor-pointer select-none active:scale-[0.97]',
              active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
            )}>
              <Icon size={14} /> {cat.label}
            </button>
          );
        })}
      </div>

      {/* Textarea */}
      <div className="rounded-2xl border border-foreground/6 bg-card shadow-tinted overflow-hidden transition-all duration-300 focus-within:border-primary/20 focus-within:shadow-tinted-lg">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={'e.g. "I need a 30-second promo video for my cafe\'s Instagram"'}
          className="w-full min-h-[130px] lg:min-h-[160px] resize-none bg-transparent px-5 pt-5 pb-2 text-[15px] sm:text-base leading-relaxed text-foreground placeholder:text-muted-foreground/45 focus:outline-none"
          autoFocus
        />
        <div className="flex items-center justify-between px-5 pb-3">
          <p className={cn('text-[11px] transition-colors duration-200', description.trim().length >= 5 ? 'text-emerald-600/70' : 'text-muted-foreground/50')}>
            {description.trim().length < 5 ? 'Tell us a little more...' : 'Looks good'}
          </p>
        </div>
      </div>

      {/* Value props */}
      <div className="mt-6 grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { icon: Euro, label: 'Affordable rates', sub: 'Student-friendly prices' },
          { icon: Zap, label: 'Fast turnaround', sub: 'Motivated talent' },
          { icon: Shield, label: 'Vano vetted', sub: 'Quality assured' },
        ].map(v => (
          <div key={v.label} className="flex flex-col items-center text-center gap-2 rounded-2xl border border-foreground/4 bg-foreground/[0.015] px-2.5 py-4 sm:py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/8">
              <v.icon size={16} className="text-primary" />
            </div>
            <p className="text-[11px] sm:text-xs font-semibold text-foreground leading-tight">{v.label}</p>
            <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight">{v.sub}</p>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => goTo(2)} disabled={!canProceedStep1} className={cn(
        'mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 sm:py-4 text-sm sm:text-base font-semibold transition-all cursor-pointer select-none active:scale-[0.97]',
        canProceedStep1
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:brightness-110'
          : 'bg-muted text-muted-foreground cursor-not-allowed'
      )}>
        Continue <ArrowRight size={15} />
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <button type="button" onClick={() => goTo(1)} className="mb-4 flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">When & how much?</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          Pick a timeline and budget — we'll find freelancers who fit.
        </p>
      </header>

      {/* Brief recap */}
      <div className="mb-5 rounded-xl border border-foreground/8 bg-muted/20 px-4 py-3 flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {category ? (() => { const C = CATEGORIES.find(c => c.id === category); return C ? <C.icon size={14} className="text-primary" /> : <Sparkles size={14} className="text-primary" />; })() : <Sparkles size={14} className="text-primary" />}
        </div>
        <p className="text-sm text-foreground leading-relaxed line-clamp-2 pt-0.5">{description}</p>
      </div>

      {/* Timeline */}
      <div className="mb-5">
        <p className="text-sm sm:text-base font-semibold text-foreground mb-2.5 flex items-center gap-2">
          <Clock size={14} className="text-muted-foreground" /> When do you need it?
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {TIMELINES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTimeline(t.id)}
              className={cn(
                'relative z-10 flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 sm:py-4 cursor-pointer select-none transition-all active:scale-[0.97]',
                timeline === t.id
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              <span className="text-sm sm:text-base font-semibold">{t.label}</span>
              <span className={cn('text-[10px] sm:text-[11px]', timeline === t.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{t.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="mb-5">
        <p className="text-sm sm:text-base font-semibold text-foreground mb-2.5 flex items-center gap-2">
          <Euro size={14} className="text-muted-foreground" /> What's your budget?
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {BUDGETS.map(b => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBudget(b.id)}
              className={cn(
                'relative z-10 flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 sm:py-4 cursor-pointer select-none transition-all active:scale-[0.97]',
                budget === b.id
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              <span className="text-sm sm:text-base font-semibold">{b.label}</span>
              <span className={cn('text-[10px] sm:text-[11px]', budget === b.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{b.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reassurance */}
      <p className="text-center text-[11px] sm:text-xs text-muted-foreground mb-4">
        Student freelancers = affordable rates + real motivation to deliver great work for their portfolio.
      </p>

      <button type="button" onClick={() => goTo(3)} disabled={!canProceedStep2} className={cn(
        'flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 sm:py-4 text-sm sm:text-base font-semibold cursor-pointer select-none transition-all active:scale-[0.97]',
        canProceedStep2
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:brightness-110'
          : 'bg-muted text-muted-foreground cursor-not-allowed'
      )}>
        See my options <ArrowRight size={15} />
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <button type="button" onClick={() => goTo(2)} className="mb-4 flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition cursor-pointer">
        <ArrowLeft size={14} /> Back
      </button>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          Choose how to hire
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          Let us handle everything, or message freelancers yourself.
        </p>
      </header>

      {/* ── OPTION A — Let Vano Handle It (primary, full-width) ── */}
      <div>
        {!submitted ? (
          <div className="overflow-hidden rounded-2xl border-2 border-primary shadow-lg">
            <div className="bg-primary px-5 py-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-white" />
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Recommended</span>
              </div>
              <h2 className="text-lg font-bold text-white">Let Vano find your freelancer</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-white/75">
                Tell us what you need, we match you with the right person at the right price. You just approve.
              </p>
            </div>
            <div className="space-y-3 bg-gradient-to-b from-primary/95 to-primary/85 px-5 pb-5 pt-3">
              {/* How it works */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { num: '1', text: 'You describe it' },
                  { num: '2', text: 'We find the match' },
                  { num: '3', text: 'You approve & pay' },
                ].map(s => (
                  <div key={s.num} className="flex flex-col items-center gap-1 rounded-lg bg-white/10 px-2 py-2.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-[10px] font-bold text-white">{s.num}</span>
                    <p className="text-[10px] font-medium text-white/80 text-center leading-tight">{s.text}</p>
                  </div>
                ))}
              </div>

              {/* Brief summary */}
              <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-1">Your request</p>
                <p className="text-xs text-white/80 line-clamp-2">{description}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {[
                    category && CATEGORIES.find(c => c.id === category)?.label,
                    timeline && TIMELINES.find(t => t.id === timeline)?.label,
                    budget && BUDGETS.find(b => b.id === budget)?.label,
                  ].filter(Boolean).map(tag => (
                    <span key={tag} className="inline-block rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/80">{tag}</span>
                  ))}
                </div>
              </div>

              {/* Fee */}
              <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/20">
                  <Euro size={14} className="text-emerald-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">0% commission</p>
                  <p className="text-[10px] text-white/60">You only pay the freelancer — no hidden fees.</p>
                </div>
              </div>

              <button data-mascot="hire-submit" type="button" onClick={handleVanoSubmit} disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-primary shadow-sm cursor-pointer select-none transition hover:opacity-90 active:scale-[0.98]">
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Sending...</> : <><Send size={15} /> Send request to Vano</>}
              </button>
              <p className="text-center text-[10px] text-white/45">Free consultation · No commitment · Response within 24hrs</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-500" />
            <h2 className="text-lg font-bold text-foreground">Request sent!</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              We're reviewing your brief and will match you with the best freelancer. Expect to hear back within 24 hours.
            </p>
            <a href={teamWhatsAppHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15">
              <MessageCircle size={15} /> Chat with us on WhatsApp
            </a>
          </div>
        )}
      </div>

      {/* ── OPTION B — Message Freelancers Directly (collapsed by default) ── */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowDirectHire(prev => !prev)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground transition hover:text-foreground hover:border-foreground/20 cursor-pointer select-none"
        >
          <MessageCircle size={14} />
          Or browse & message freelancers yourself
          <ChevronDown size={14} className={cn('transition-transform duration-200', showDirectHire && 'rotate-180')} />
        </button>

        <AnimatePresence>
          {showDirectHire && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <div className="rounded-2xl border border-foreground/10 bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageCircle size={16} className="text-muted-foreground" />
                    <h2 className="text-[15px] sm:text-base font-semibold text-foreground">Message freelancers directly</h2>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-4 leading-relaxed">
                    Your brief is pre-filled — just tap "Message" to start a conversation. Compare quotes and pick who fits best.
                  </p>

                  {matchLoading ? (
                    <div className="flex flex-col gap-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="overflow-hidden rounded-2xl border border-foreground/10 bg-card animate-pulse">
                          <div className="h-32 w-full bg-muted/60" />
                          <div className="p-4 space-y-3">
                            <div className="flex items-center gap-3">
                              <div className="h-11 w-11 rounded-full bg-muted" />
                              <div className="flex-1 space-y-2">
                                <div className="h-3 w-28 rounded bg-muted" />
                                <div className="h-2.5 w-20 rounded bg-muted" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : matchedStudents.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {matchedStudents.slice(0, 3).map((student, idx) => {
                        const ratingInfo = matchedReviews[student.user_id];
                        return (
                          <div key={student.id} className="animate-fade-in opacity-0" style={{ animationDelay: `${idx * 50}ms` }}>
                            <StudentCard
                              student={student}
                              displayName={matchedProfiles[student.user_id]?.name || 'Freelancer'}
                              profileAvatarUrl={matchedProfiles[student.user_id]?.avatar || null}
                              showFavourite={false}
                              avgRating={ratingInfo?.avg ?? null}
                              reviewCount={ratingInfo?.count}
                            />
                            <button type="button" onClick={() => messageFreelancer(student.user_id)} className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary cursor-pointer select-none transition hover:bg-primary/10 active:scale-[0.98]">
                              <MessageCircle size={14} /> Message with your brief
                            </button>
                          </div>
                        );
                      })}
                      {matchedStudents.length > 3 && (
                        <button type="button" onClick={() => navigate('/students')} className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition cursor-pointer">
                          View all {matchedStudents.length} freelancers <ArrowRight size={14} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No matches found right now.</p>
                      <button type="button" onClick={() => navigate('/students')} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer">
                        Browse all freelancers <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead title="Hire a Freelancer – VANO" description="Tell us what you need. Get matched with affordable, motivated talent in seconds." />
      <Navbar />

      <div className={cn(
        'mx-auto px-4 pt-20 sm:px-6 sm:pt-24 md:px-8',
        'max-w-2xl lg:max-w-3xl'
      )}>

        {/* ── Journey map with animated character ── */}
        <JourneyMap
          currentStep={step}
          steps={HIRE_JOURNEY_STEPS}
          className="mb-4"
        />

        {/* Render active step — simple fade transition, no pointer-event issues */}
        <AnimatePresence mode="wait" custom={stepDirection}>
          <motion.div
            key={step}
            custom={stepDirection}
            initial={{ opacity: 0, x: stepDirection * (isMobileHire ? 40 : 80), scale: isMobileHire ? 0.97 : 0.94, filter: isMobileHire ? 'blur(2px)' : 'blur(5px)' }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: stepDirection * (isMobileHire ? -20 : -40), scale: 0.97, filter: isMobileHire ? 'blur(1px)' : 'blur(2px)' }}
            transition={{ type: 'spring', stiffness: 300, damping: isMobileHire ? 30 : 26 }}
            className="relative z-10"
            style={{ willChange: 'transform, opacity, filter' }}
          >
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
          </motion.div>
        </AnimatePresence>

        {/* ── Done-for-you pricing packages ── */}
        <div className="mt-14 border-t border-foreground/[0.06] pt-10 mb-4">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Done for you
          </p>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Or pick a package
          </h2>
          <p className="mt-1.5 mb-6 text-sm text-muted-foreground leading-relaxed">
            Fixed-price packages — we handle everything from start to finish.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {PRICING_PACKAGES.map((pkg) => (
              <div
                key={pkg.name}
                className={cn(
                  'relative flex flex-col rounded-2xl border bg-card p-5 transition-all hover:shadow-md',
                  pkg.popular
                    ? 'border-primary/30 shadow-[0_0_0_1px_hsl(221_83%_53%/0.08)]'
                    : 'border-foreground/[0.06]'
                )}
              >
                {pkg.popular && (
                  <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                    Most popular
                  </span>
                )}

                <h3 className="text-[14px] font-semibold">{pkg.name}</h3>

                <p className="mt-2 mb-3 flex items-baseline gap-0.5">
                  <span className="text-xs text-muted-foreground">€</span>
                  <span className="text-2xl font-bold tracking-tighter tabular-nums">{pkg.price}</span>
                  <span className="text-xs text-muted-foreground">{pkg.period}</span>
                </p>

                <ul className="mb-4 flex-1 space-y-1.5">
                  {pkg.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12px] text-muted-foreground leading-snug">
                      <Check size={12} className="mt-0.5 shrink-0 text-primary/70" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi! I'm interested in the ${pkg.name} package (€${pkg.price}${pkg.period}).`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-[#1fba59] hover:shadow-[0_4px_12px_-4px_rgba(37,211,102,0.4)] active:scale-[0.97]"
                >
                  <MessageCircle size={15} strokeWidth={1.8} />
                  Get started
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HirePage;
