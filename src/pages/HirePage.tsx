import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { StudentCard } from '@/components/StudentCard';
import { useToast } from '@/hooks/use-toast';
import { isEmailVerified } from '@/lib/authSession';
import { teamWhatsAppHref } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { clearHireBrief, loadHireBrief, saveHireBrief } from '@/lib/hireFlow';
import { setGoogleOAuthIntent } from '@/lib/googleOAuth';
import { getAuthRedirectUrl } from '@/lib/siteUrl';
import { markUserActed } from '@/lib/userActivity';
import {
  ArrowRight, ArrowLeft, Sparkles, MessageCircle, Send,
  Video, TrendingUp, Monitor, Megaphone, HelpCircle,
  Clock, Loader2, CheckCircle2, Euro,
  Shield, Zap, Check, ChevronDown,
} from 'lucide-react';
import { JourneyMap, HIRE_JOURNEY_STEPS } from '@/components/JourneyMap';
import { track } from '@/lib/track';
import { isInAppBrowser } from '@/lib/inAppBrowser';
import { COMMUNITY_CATEGORIES, isCommunityCategoryId } from '@/lib/communityCategories';
import { IRELAND_COUNTIES, isIrelandCounty } from '@/lib/irelandCounties';
import {
  Select as UiSelect,
  SelectContent as UiSelectContent,
  SelectItem as UiSelectItem,
  SelectTrigger as UiSelectTrigger,
  SelectValue as UiSelectValue,
} from '@/components/ui/select';

/* ─── Constants ─── */

const CATEGORIES = [
  { id: 'videography', label: 'Video', icon: Video,
    keywords: ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo'],
    subtypes: ['Reel / short-form', 'Promo / ad', 'Event / wedding', 'Corporate / explainer', 'Podcast / interview'] },
  { id: 'digital_sales', label: 'Sales', icon: TrendingUp,
    keywords: ['sales', 'sdr', 'bdr', 'cold call', 'cold email', 'outbound', 'lead gen', 'lead generation', 'prospect', 'closing', 'b2b', 'saas sales'],
    subtypes: ['Cold email outreach', 'Cold calling / SDR', 'Lead generation', 'Appointment setting', 'Sales closing'] },
  { id: 'websites', label: 'Website', icon: Monitor,
    keywords: ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify'],
    subtypes: ['Landing page', 'Full website', 'Shopify / e-commerce', 'Fix / improve existing', 'Web app / dashboard'] },
  { id: 'social_media', label: 'Content Creation', icon: Megaphone,
    keywords: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy'],
    subtypes: ['Content / posts', 'Strategy & growth', 'Paid ads', 'Community management', 'Short-form (TikTok / Reels)'] },
  { id: 'other', label: 'Other', icon: HelpCircle, keywords: [], subtypes: [] as string[] },
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  videography: 'Video',
  digital_sales: 'Sales',
  websites: 'Website',
  social_media: 'Social media',
  other: 'Other',
};

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
    name: 'Content Creation',
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
      'Outbound sales campaign',
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
  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState(1); // 1 = forward, -1 = backward

  // Brief
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(searchParams.get('category'));
  const [subtype, setSubtype] = useState<string | null>(null);
  // Stage 5 Ireland-scale: only asked for local categories (videography).
  // Digital categories skip the question entirely — zero added clicks.
  const [hirerCounty, setHirerCounty] = useState<string>('');
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  // Results
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [matchedStudents, setMatchedStudents] = useState<any[]>([]);
  const [matchedProfiles, setMatchedProfiles] = useState<Record<string, { name: string; avatar: string }>>({});
  const [matchedReviews, setMatchedReviews] = useState<Record<string, { avg: string; count: number }>>({});
  const [matchLoading, setMatchLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // On mount: restore a brief persisted across Google OAuth if one is pending.
  // This lets signed-out hirers fill the whole wizard, bounce through auth, and
  // land right back on Step 3 with every field intact — no re-entry, no extra
  // clicks.
  const briefRestoredRef = useRef(false);
  useEffect(() => {
    const brief = loadHireBrief();
    if (brief) {
      briefRestoredRef.current = true;
      setDescription(brief.description);
      setCategory(brief.category);
      setSubtype(brief.subtype);
      setTimeline(brief.timeline);
      setBudget(brief.budget);
      setStep(3);
      return;
    }
    const cat = searchParams.get('category');
    if (cat) {
      const found = CATEGORIES.find(c => c.id === cat);
      if (found) {
        setCategory(cat);
        // Optional ?subtype=… from Landing tag cloud lets us skip Step 1
        // entirely. We validate against the known subtypes for the matching
        // category so a hand-typed bad param can't poison the brief.
        const st = searchParams.get('subtype');
        if (st && found.subtypes.includes(st)) {
          setSubtype(st);
        }
      }
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
    setCategory(id);
    // Always reset sub-type when switching categories — stale chips from a
    // different category would silently feed into the synthesized description.
    setSubtype(null);
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

      // Stage 5 Ireland-scale location filter — wrapped in a helper so
      // both branches below share the exact same policy.
      // • Local category (videography) + hirerCounty chosen → keep
      //   freelancers whose county matches OR who opt into remote work
      //   from other counties (`remote_ok = true`). This means a
      //   Galway videographer willing to travel still matches a Cork
      //   hire — the explicit opt-in is what makes it sensible.
      // • Local category but hirerCounty blank → no location filter
      //   (preserves today's behaviour on the first render before the
      //   user picks a county).
      // • Digital category → require `remote_ok` is not false. Matches
      //   the wizard's auto-set default of `true` for digital categories
      //   and still respects a freelancer who explicitly flipped it off.
      const catLocationModel = category && isCommunityCategoryId(category)
        ? COMMUNITY_CATEGORIES[category].locationModel
        : null;
      const passesLocation = (s: any): boolean => {
        if (catLocationModel === 'local') {
          if (!hirerCounty) return true;
          return s.county === hirerCounty || s.remote_ok === true;
        }
        if (catLocationModel === 'digital') {
          return s.remote_ok !== false;
        }
        return true;
      };

      let matched: any[];
      if (keywords.length > 0) {
        matched = students.filter(s => {
          const skills = (s.skills || []).map((sk: string) => sk.toLowerCase());
          if (!skills.some((skill: string) => keywords.some(kw => skill.includes(kw)))) return false;
          if (budgetRange && s.typical_budget_min != null && s.typical_budget_max != null) {
            if (budgetRange.max < s.typical_budget_min || budgetRange.min > s.typical_budget_max) return false;
          }
          if (!passesLocation(s)) return false;
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
  // `autoOpenWhatsApp` is false when this runs automatically after a Google
  // OAuth resume — browsers block `window.open` without a direct user click,
  // and the submitted-state UI already surfaces a WhatsApp button.
  const handleVanoSubmit = async (autoOpenWhatsApp = true) => {
    if (!user) {
      // Persist the brief so it survives the OAuth round-trip, then kick off
      // Google sign-in directly from here. No /auth page detour.
      saveHireBrief({ description, category, subtype, timeline, budget });
      // Short-circuit Google OAuth inside in-app browsers (Fiverr, Instagram,
      // TikTok, …). Brief stays saved via saveHireBrief so when they re-open
      // in Safari/Chrome and sign in, Step 3 resumes as before.
      if (isInAppBrowser()) {
        track('in_app_browser_blocked', { source: 'hire_vano_submit' });
        toast({
          title: "Can't sign in here",
          description: "Open this page in Safari or Chrome first — your brief is saved.",
          variant: 'destructive',
        });
        return;
      }
      setGoogleOAuthIntent('business');
      // Reassure the user mid-redirect: the brief they just typed is saved and
      // we'll resume on Step 3 once they're signed in. Without this the page
      // disappears to Google with no signal that anything was preserved.
      toast({
        title: 'Saving your brief…',
        description: "We'll bring you right back to finish.",
      });
      setSubmitting(true);
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getAuthRedirectUrl(),
            queryParams: { access_type: 'offline', prompt: 'consent select_account' },
          },
        });
        if (error) throw error;
      } catch (err) {
        clearHireBrief();
        setSubmitting(false);
        toast({ title: 'Sign-in failed', description: 'Please try again.', variant: 'destructive' });
      }
      return;
    }
    if (!isEmailVerified({ user } as any)) {
      toast({ title: 'Please verify your email first', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const finalDescription = buildDescription();
    const { error } = await supabase.from('hire_requests' as any).insert({
      requester_id: user.id, description: finalDescription, category, budget_range: budget, timeline, status: 'pending',
    } as any);
    if (error) {
      toast({ title: 'Something went wrong', description: 'Please try again or message us on WhatsApp.', variant: 'destructive' });
    } else {
      setSubmitted(true);
      markUserActed();
      track('vano_match_sent', { category, timeline, budget });
      clearHireBrief();
      if (autoOpenWhatsApp) {
        // Auto-open WhatsApp with request details so the team can respond directly
        const catLabel = CATEGORIES.find(c => c.id === category)?.label || 'Not specified';
        const timelineLabel = TIMELINES.find(t => t.id === timeline)?.label || 'Not specified';
        const budgetLabel = BUDGETS.find(b => b.id === budget)?.label || 'Not specified';
        const waLines = [
          `Hi! I just submitted a hire request on VANO.`,
          ``,
          `Project: ${finalDescription}`,
          `Category: ${catLabel}`,
          `Timeline: ${timelineLabel}`,
          `Budget: ${budgetLabel}`,
        ];
        window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(waLines.join('\n'))}`, '_blank');
      }
      supabase.functions.invoke('notify-hire-request', {
        body: { description: finalDescription, category, budget_range: budget, timeline, requester_email: user.email },
      }).catch(() => {});
    }
    setSubmitting(false);
  };

  /* Auto-submit once on post-OAuth return. Fires when the restored brief meets
   * the freshly-loaded session. */
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (!briefRestoredRef.current || autoSubmittedRef.current) return;
    if (!user || submitting || submitted) return;
    // Post-OAuth auto-submit guard: accept either a typed description OR a
    // category + sub-type pick, matching the new click-only Step 1.
    const hasChipBrief = !!category && !!subtype;
    if (!description.trim() && !hasChipBrief) return;
    autoSubmittedRef.current = true;
    void handleVanoSubmit(false);
    // handleVanoSubmit depends on current field state; re-run only on user change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ── Message freelancer with pre-filled draft ── */
  const messageFreelancer = (freelancerUserId: string) => {
    track('freelancer_card_clicked', { freelancer_id: freelancerUserId, source: 'hire_step3', category });
    if (!user) { navigate('/auth'); return; }
    const budgetLabel = BUDGETS.find(b => b.id === budget)?.label || '';
    const timelineLabel = TIMELINES.find(t => t.id === timeline)?.label || '';
    const ask = buildDescription();
    const draft = `Hi! I'm looking for help with: ${ask}${budgetLabel ? ` | Budget: ${budgetLabel}` : ''}${timelineLabel ? ` | Timeline: ${timelineLabel}` : ''}`;
    navigate(`/messages?with=${freelancerUserId}&draft=${encodeURIComponent(draft)}`);
  };

  /* ── Multi-send: fan the brief out to the top N matched freelancers. ──
     The structural fix to the "single freelancer ghosted me" leak. We send
     to up to 3 of the visible matches in parallel; the first to reply wins
     (DB trigger handles the open → filled transition). */
  // Toggles the inline freelancer list on Step 3. Collapsed by default so
  // the Vano-match card above reads as the primary CTA; users who want to
  // pick directly open the list with the "Choose a freelancer yourself"
  // button.
  const [showDirectList, setShowDirectList] = useState(false);

  useEffect(() => {
    if (step === 3) fetchMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hirerCounty]);

  // Funnel visibility: every step view is an event so we can see drop-off.
  useEffect(() => {
    track('hire_step_viewed', { step, category, has_subtype: !!subtype });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* Auto-advance step 2 → step 3 once both picks are made, so a signed-in user
   * can go Category → Continue → Timeline → Budget and land on options without
   * a separate "See my options" click. */
  useEffect(() => {
    if (step !== 2) return;
    if (timeline && budget) {
      setStepDirection(1);
      setStep(3);
    }
  }, [step, timeline, budget]);

  /* Auto-advance step 1 → step 2 once both category + sub-type are picked.
   * Happy path becomes literally two clicks on step 1. Skip for "Other" since
   * there's no sub-type row — the user must type + click Continue themselves. */
  useEffect(() => {
    if (step !== 1) return;
    if (!category || category === 'other') return;
    if (!subtype) return;
    const t = window.setTimeout(() => {
      setStepDirection(1);
      setStep(2);
    }, 220);
    return () => window.clearTimeout(t);
  }, [step, category, subtype]);

  // Step 1 unlocks when the user has chosen a category AND either picked a
  // sub-type chip (frictionless click path) or typed a short free-form hint
  // for the "Other" branch which has no sub-types.
  const canProceedStep1 = !!category && (
    !!subtype ||
    (category === 'other' && description.trim().length >= 5)
  );
  const canProceedStep2 = !!timeline && !!budget;

  // Canonical description built from the chips. The textarea is optional
  // extra detail; if it's empty, downstream consumers still get
  // "Video — Reel / short-form" etc. Satisfies the NOT NULL constraint on
  // hire_requests.description.
  const buildDescription = (): string => {
    const catLabel = category ? CATEGORY_LABEL[category] : '';
    const parts: string[] = [];
    if (catLabel && subtype) parts.push(`${catLabel} — ${subtype}`);
    else if (catLabel) parts.push(catLabel);
    const extra = description.trim();
    if (extra) parts.push(extra);
    return parts.join('. ') || extra || catLabel || 'New hire request';
  };

  // Short recap shown on Steps 2 and 3 above the header.
  const recap = (() => {
    const catLabel = category ? CATEGORY_LABEL[category] : '';
    const extra = description.trim();
    if (catLabel && subtype) return `${catLabel} — ${subtype}${extra ? ` · ${extra}` : ''}`;
    return extra || catLabel || '';
  })();

  /* ── Render helpers ── */

  const renderStep1 = () => (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          What do you need done?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          Pick a category, pick what you need — we'll take it from there.
        </p>
      </header>

      {/* Category chips — intentionally the largest controls on this step.
          These are the decision. Everything below (optional detail, value
          props) should read as supporting material. */}
      <div className="flex flex-wrap gap-2.5 mb-5">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const active = category === cat.id;
          return (
            <button key={cat.id} type="button" onClick={() => handleCategoryPick(cat.id)} className={cn(
              'flex items-center gap-2 rounded-full border px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base font-semibold transition-all cursor-pointer select-none active:scale-[0.97]',
              active ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
            )}>
              <Icon size={18} /> {cat.label}
            </button>
          );
        })}
      </div>

      {/* County picker — only rendered for local categories (videography).
          Digital categories get nothing (zero added clicks) because they
          match across all of Ireland via the remote_ok filter. */}
      {(() => {
        if (!category || !isCommunityCategoryId(category)) return null;
        const model = COMMUNITY_CATEGORIES[category].locationModel;
        if (model === 'digital') {
          return (
            <div className="mb-5 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Remote across Ireland.</span>{' '}
              {COMMUNITY_CATEGORIES[category].label} freelancers work online, so we&apos;ll match from anywhere in Ireland.
            </div>
          );
        }
        // Local category — ask for the hirer's county.
        return (
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Where do you need them?
            </p>
            <UiSelect value={hirerCounty} onValueChange={setHirerCounty}>
              <UiSelectTrigger className="h-11">
                <UiSelectValue placeholder="Pick your county" />
              </UiSelectTrigger>
              <UiSelectContent>
                {IRELAND_COUNTIES.map((c) => (
                  <UiSelectItem key={c} value={c}>{c}</UiSelectItem>
                ))}
              </UiSelectContent>
            </UiSelect>
          </div>
        );
      })()}

      {/* Sub-type chips — the click path that replaces typing. Only renders
          for categories that have sub-types defined (skips "Other"). */}
      {(() => {
        const cat = CATEGORIES.find(c => c.id === category);
        if (!cat || cat.subtypes.length === 0) return null;
        return (
          <div className="mb-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              What kind of {cat.label.toLowerCase()}?
            </p>
            <div className="flex flex-wrap gap-2.5">
              {cat.subtypes.map(st => {
                const active = subtype === st;
                return (
                  <button key={st} type="button" onClick={() => setSubtype(st)} className={cn(
                    'rounded-full border px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base font-semibold transition-all cursor-pointer select-none active:scale-[0.97]',
                    active ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                  )}>
                    {st}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Optional scratch space for extra context. Intentionally de-emphasised
          below the chips (dashed border, smaller text, shorter height) so it
          reads as a footnote, not a required field. For "Other" it graduates
          back to a solid card since it becomes the only input path. */}
      <div className={cn(
        'rounded-2xl bg-card overflow-hidden transition-all duration-300',
        category === 'other'
          ? 'border border-foreground/6 shadow-tinted focus-within:border-primary/20 focus-within:shadow-tinted-lg'
          : 'border border-dashed border-foreground/10 shadow-sm focus-within:border-primary/25 focus-within:border-solid',
      )}>
        <div className="flex items-center justify-between px-4 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {category === 'other' ? 'Tell us what you need' : 'Add any extra detail'}
            {category !== 'other' && <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/60">(optional)</span>}
          </p>
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={category === 'other'
            ? 'Describe what you need — the more specific, the better match we can find.'
            : "Anything the freelancer should know upfront (deadline context, brand, examples…)"}
          className={cn(
            'w-full resize-none bg-transparent px-4 pt-2 pb-3 leading-relaxed text-foreground placeholder:text-muted-foreground/45 focus:outline-none',
            category === 'other'
              ? 'min-h-[96px] lg:min-h-[120px] text-[15px] sm:text-base'
              : 'min-h-[72px] lg:min-h-[88px] text-sm',
          )}
        />
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
        <p className="text-sm text-foreground leading-relaxed line-clamp-2 pt-0.5">{recap || 'Your request'}</p>
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
          Let Vano match you with a trusted freelancer, or message a freelancer directly.
        </p>
      </header>

      {/* ── OPTION A — Vano Match (primary, full-width) ──
           Premium styling: amber-gold ring + gradient header signal
           "concierge upgrade" so the recommended path looks chosen-for-you,
           not just another primary button. */}
      <div>
        {!submitted ? (
          <div className="relative overflow-hidden rounded-2xl border-2 border-primary shadow-lg ring-1 ring-amber-300/40 ring-offset-2 ring-offset-background">
            <div className="relative bg-gradient-to-br from-primary via-primary to-primary/90 px-5 py-4">
              {/* Subtle gold sheen in the corner — tiny, tasteful, premium */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-300/15 blur-2xl" />
              <div className="relative flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-amber-200" />
                <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow-sm">Recommended</span>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-400/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-50 ring-1 ring-emerald-300/40">
                  €0 platform fee
                </span>
              </div>
              <h2 className="relative text-lg font-bold text-white">Match with a trusted freelancer</h2>
              <p className="relative mt-1 text-[13px] leading-relaxed text-white/75">
                Tailored to your brief — we pick a vetted freelancer at the right price. You just approve.
                <span className="mt-1 block font-semibold text-emerald-200">You pay the freelancer directly. No hidden fees, no commission.</span>
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
                <p className="text-xs text-white/80 line-clamp-2">{recap || 'Your request'}</p>
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

              <button data-mascot="hire-submit" type="button" onClick={handleVanoSubmit} disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3.5 text-sm font-bold text-primary shadow-sm cursor-pointer select-none transition hover:opacity-90 active:scale-[0.98]">
                {submitting ? <><Loader2 size={15} className="animate-spin" /> Sending...</> : <><Send size={15} /> Send request to Vano</>}
              </button>
              <p className="text-center text-[10px] text-white/45">Free consultation · No commitment · Response within 24hrs</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-2 text-emerald-500" />
            <h2 className="text-lg font-bold text-foreground">Request sent — we're on it</h2>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Your brief is with the Vano team. We'll match a freelancer and open a thread in your{' '}
              <button type="button" onClick={() => navigate('/messages')} className="font-semibold text-primary underline underline-offset-2 hover:no-underline">Messages</button>{' '}
              within 24h. You'll also get an email.
            </p>
            {/* Reinforce that the user isn't blocked — they can also browse and
                message a freelancer directly from the list below. */}
            <p className="mt-3 text-xs text-muted-foreground/90 leading-relaxed max-w-sm mx-auto">
              Want a reply faster? Tap <span className="font-semibold text-foreground">Choose a freelancer yourself</span> below and message one directly — most reply within the hour.
            </p>
            <a href={teamWhatsAppHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15">
              <MessageCircle size={15} /> Chat with us on WhatsApp
            </a>
          </div>
        )}
      </div>

      {/* ── OPTION B — Secondary CTA: reveal freelancer list on click ──
           Sits directly under the Vano card as a white / outline full-width
           button so it reads as the clearly-secondary path. Tapping it expands
           the matched-freelancer panel inline. The previous green "Get quotes
           from top 3" broadcast CTA was removed — users preferred the simpler
           "pick yourself" interaction. */}
      <button
        type="button"
        onClick={() => setShowDirectList((s) => !s)}
        aria-expanded={showDirectList}
        className={cn(
          'mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 bg-card px-6 py-4 text-sm sm:text-base font-semibold text-foreground shadow-sm transition-all cursor-pointer select-none active:scale-[0.98]',
          showDirectList ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/25 hover:bg-primary/5',
        )}
      >
        <MessageCircle size={15} className="text-muted-foreground" />
        Choose a freelancer yourself
        <ChevronDown
          size={15}
          className={cn('text-muted-foreground transition-transform duration-200', showDirectList && 'rotate-180')}
        />
      </button>

      {showDirectList && (
      <div className="mt-4 animate-fade-in">
        <div className="flex items-baseline justify-between mb-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Or pick a freelancer yourself
          </p>
          {matchedStudents.length > 3 && (
            <button
              type="button"
              onClick={() => navigate('/students')}
              className="text-[11px] font-semibold text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              View all {matchedStudents.length} <ArrowRight size={12} />
            </button>
          )}
        </div>

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
            {matchedStudents.slice(0, 3).map((student) => {
              const ratingInfo = matchedReviews[student.user_id];
              return (
                <div key={student.id}>
                  <StudentCard
                    student={student}
                    displayName={matchedProfiles[student.user_id]?.name || 'Freelancer'}
                    profileAvatarUrl={matchedProfiles[student.user_id]?.avatar || null}
                    showFavourite={false}
                    avgRating={ratingInfo?.avg ?? null}
                    reviewCount={ratingInfo?.count}
                  />
                  <button type="button" onClick={() => messageFreelancer(student.user_id)} className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2 text-[13px] font-semibold text-primary cursor-pointer select-none transition hover:bg-primary/10">
                    <MessageCircle size={14} /> Message with your brief
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card text-center py-5">
            <p className="text-sm text-muted-foreground">No matches found right now.</p>
            <button type="button" onClick={() => navigate('/students')} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline cursor-pointer">
              Browse all freelancers <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead
        title="Hire a Freelancer in Galway — Post a Gig"
        description="Tell VANO what you need. Get matched with affordable, motivated freelance talent in Galway in seconds — digital sales, videography, web, social and more."
        keywords="hire freelancer galway, post a gig galway, find videographer galway, hire sales rep galway, hire web designer galway"
      />
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

        {/* ── Done-for-you pricing packages (step 3 only — don't distract
             from the brief while it's being filled in) ── */}
        {step === 3 && (
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
        )}
      </div>
    </div>
  );
};

export default HirePage;
