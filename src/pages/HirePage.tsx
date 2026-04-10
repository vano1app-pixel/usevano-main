import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { StudentCard } from '@/components/StudentCard';
import { teamWhatsAppHref } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, ArrowLeft, Sparkles, MessageCircle,
  Video, Camera, Monitor, Megaphone, HelpCircle,
  Clock, Euro,
  Shield, Zap, Check,
} from 'lucide-react';

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

const HirePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(1);

  // Brief
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(searchParams.get('category'));
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);

  // Results
  const [matchedStudents, setMatchedStudents] = useState<any[]>([]);
  const [matchedProfiles, setMatchedProfiles] = useState<Record<string, { name: string; avatar: string }>>({});
  const [matchedReviews, setMatchedReviews] = useState<Record<string, { avg: string; count: number }>>({});
  const [matchLoading, setMatchLoading] = useState(false);
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

  const goTo = (s: number) => setStep(s);

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
      // Pick one random match
      if (matched.length > 1) {
        const idx = Math.floor(Math.random() * matched.length);
        matched = [matched[idx]];
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

  /* ── Message freelancer with pre-filled draft ── */
  const messageFreelancer = (freelancerUserId: string) => {
    if (!user) { navigate('/auth'); return; }
    const budgetLabel = BUDGETS.find(b => b.id === budget)?.label || '';
    const timelineLabel = TIMELINES.find(t => t.id === timeline)?.label || '';
    const draft = `Hi! I'm looking for help with: ${description.trim()}${budgetLabel ? ` | Budget: ${budgetLabel}` : ''}${timelineLabel ? ` | Timeline: ${timelineLabel}` : ''}`;
    navigate(`/messages?with=${freelancerUserId}&draft=${encodeURIComponent(draft)}`);
  };

  useEffect(() => { if (step === 3) fetchMatches(); }, [step]);

  const canProceedStep1 = description.trim().length >= 5 && !!category;
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

  const renderStep3 = () => {
    const student = matchedStudents[0] ?? null;
    const ratingInfo = student ? matchedReviews[student.user_id] : null;

    return (
      <div>
        <button type="button" onClick={() => goTo(2)} className="mb-4 flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition cursor-pointer">
          <ArrowLeft size={14} /> Back
        </button>

        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            Your match
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
            We found a freelancer that fits your project. Message them to get started.
          </p>
        </header>

        {/* Brief summary */}
        <div className="rounded-xl border border-foreground/10 bg-card px-4 py-3 mb-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-1">Your brief</p>
          <p className="text-sm text-foreground/80 line-clamp-2">{description}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[
              category && CATEGORIES.find(c => c.id === category)?.label,
              timeline && TIMELINES.find(t => t.id === timeline)?.label,
              budget && BUDGETS.find(b => b.id === budget)?.label,
            ].filter(Boolean).map(tag => (
              <span key={tag} className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{tag}</span>
            ))}
          </div>
        </div>

        {matchLoading ? (
          <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card animate-pulse">
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
        ) : student ? (
          <div>
            <StudentCard
              student={student}
              displayName={matchedProfiles[student.user_id]?.name || 'Freelancer'}
              profileAvatarUrl={matchedProfiles[student.user_id]?.avatar || null}
              showFavourite={false}
              avgRating={ratingInfo?.avg ?? null}
              reviewCount={ratingInfo?.count}
            />
            <button type="button" onClick={() => messageFreelancer(student.user_id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 cursor-pointer select-none transition hover:shadow-lg hover:brightness-110 active:scale-[0.98]">
              <MessageCircle size={15} /> Message this freelancer
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-foreground/10 px-6 py-10 text-center">
            <p className="text-sm font-medium text-muted-foreground">No matches found right now</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Try adjusting your category or budget to find available freelancers.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead title="Hire a Freelancer – VANO" description="Tell us what you need. Get matched with affordable, motivated talent in seconds." />
      <Navbar />

      <div className={cn(
        'mx-auto px-4 pt-20 sm:px-6 sm:pt-24 md:px-8',
        'max-w-2xl lg:max-w-3xl'
      )}>

        {/* ── Progress dots ── */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => s < step ? goTo(s) : undefined}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                s === step ? 'w-8 bg-primary' : s < step ? 'w-2 bg-primary/40 cursor-pointer hover:bg-primary/60' : 'w-2 bg-muted-foreground/20'
              )}
            />
          ))}
        </div>

        {/* Render active step — simple fade transition, no pointer-event issues */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10"
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
