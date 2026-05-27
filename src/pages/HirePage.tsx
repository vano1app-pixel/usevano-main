import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { LiveMatchesCounter } from '@/components/LiveMatchesCounter';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isEmailVerified } from '@/lib/authSession';
import { teamWhatsAppHref } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { clearHireBrief, consumeHireBriefAutoPay, loadHireBrief, saveHireBrief } from '@/lib/hireFlow';
import { setGoogleOAuthIntent } from '@/lib/googleOAuth';
import { getAuthRedirectUrl } from '@/lib/siteUrl';
import { markUserActed } from '@/lib/userActivity';
import {
  ArrowRight, ArrowLeft, Sparkles, MessageCircle,
  Video, TrendingUp, Monitor, Megaphone, HelpCircle,
  Clock, Loader2, CheckCircle2, Euro,
  ShieldCheck, Zap, Check, MailWarning,
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
  { id: 'this_week', label: 'This week', sub: 'Rush job', emoji: '⚡' },
  { id: '2_weeks', label: '2 weeks', sub: 'Standard', emoji: '📅' },
  { id: '1_month', label: '1 month', sub: 'No rush', emoji: '🌿' },
  { id: 'flexible', label: 'Flexible', sub: 'Whenever', emoji: '😌' },
] as const;

const BUDGETS = [
  { id: 'under_100', label: 'Under €100', sub: 'Small task', emoji: '💡' },
  { id: '100_250', label: '€100–250', sub: 'Most popular', emoji: '⭐' },
  { id: '250_500', label: '€250–500', sub: 'Bigger project', emoji: '🚀' },
  { id: '500_plus', label: '€500+', sub: 'Full project', emoji: '🏆' },
  { id: 'unsure', label: 'I want a quote', sub: "We'll advise", emoji: '💬' },
] as const;

const BUDGET_TO_RANGE: Record<string, { min: number; max: number }> = {
  under_100: { min: 0, max: 100 },
  '100_250': { min: 100, max: 250 },
  '250_500': { min: 250, max: 500 },
  '500_plus': { min: 500, max: 9999 },
  unsure: { min: 0, max: 9999 },
};

// Category-specific "vibe / style / platform" chips surfaced on Step 1
// after the sub-type pick. Single-tap, skippable, and their label is
// concatenated into the brief string before it hits the matcher — so
// picking "Cinematic" bumps freelancers whose skills or post titles
// mention cinematic, without any schema change.
//
// Each entry is a free-form token the matcher already tokenizes via
// the existing word-boundary scorer in AiFindResults.pickVanoMatchClientSide;
// no matcher code touches this const. Edit freely per category.
const STYLE_TAGS: Record<string, readonly string[]> = {
  videography:   ['Cinematic', 'Casual', 'Luxury', 'Fun', 'Corporate'],
  digital_sales: ['B2B', 'B2C', 'Both'],
  websites:      ['Business site', 'Portfolio', 'E-commerce', 'Landing page', 'Web app'],
  social_media:  ['TikTok', 'Instagram', 'YouTube', 'LinkedIn', 'All platforms'],
  other:         [],
};

const STYLE_TAG_PROMPTS: Record<string, string> = {
  videography:   'What vibe?',
  digital_sales: 'Who are you selling to?',
  websites:      "What's it for?",
  social_media:  'Which platform?',
  other:         '',
};

/* ─── Helpers ─── */

// Fire-and-forget: send a fresh verification email and tell the user
// where it went. Previously we just toasted "Please verify your email
// first" and expected them to find the email from days ago in their
// inbox — most didn't. Now we always push a new one on click, so the
// user's next tab is their mail app instead of their browser history.
async function resendVerifyEmail(
  email: string | null,
  toast: (args: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void,
): Promise<void> {
  if (!email) {
    toast({ title: 'Please verify your email first', variant: 'destructive' });
    return;
  }
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw error;
    toast({
      title: 'Verification email sent',
      description: `Check ${email} and tap the link, then come back and try again.`,
    });
  } catch (err) {
    // Rate limit / network fail — keep it informative rather than silent.
    console.warn('[HirePage] resend verify failed', err);
    toast({
      title: 'Please verify your email first',
      description: `We couldn't send a new link right now. Check ${email} for the original one.`,
      variant: 'destructive',
    });
  }
}

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
  // Style / vibe / platform tag — optional per-category signal that
  // the matcher treats like an extra brief token. Not persisted across
  // the OAuth round-trip; losing it is a single tap to redo. Reset
  // alongside subtype whenever the category changes.
  const [styleTag, setStyleTag] = useState<string | null>(null);
  // "Who's it for?" — category-independent, so it persists across
  // category swaps unlike styleTag. Also appended to the brief.
  const [audience, setAudience] = useState<string | null>(null);
  // Stage 5 Ireland-scale: only asked for local categories (videography).
  // Digital categories skip the question entirely — zero added clicks.
  const [hirerCounty, setHirerCounty] = useState<string>('');
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  // Results
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Step 1 "Add any extra detail" textarea is optional and chips already
  // build a usable description from category + subtype. We collapse it
  // behind a disclosure for known categories so happy-path hirers see a
  // shorter step. For "Other" the textarea is the only input path and
  // stays always-visible below. Auto-expands on HirePage load if a
  // restored brief already contains typed text so we never swallow it.
  // The `matchedStudents` / `matchedProfiles` / `matchedReviews` /
  // `matchLoading` state + `fetchMatches()` function that used to live
  // here was dead code — it populated on Step 3 but nothing rendered
  // the results (a leftover from the earlier "preview your options"
  // design). Removed on 2026-04-23 to stop four Supabase queries
  // firing on every Step 3 load for no UI benefit. The actual match
  // happens server-side after the €1 payment via the AI Find flow.
  const [user, setUser] = useState<any>(null);
  // Surfaces email-verification status before the user taps the €1 button.
  // Without this, signed-in-but-unverified hirers fill the whole wizard,
  // tap "Match me — €1", and get a destructive toast asking them to verify.
  // The banner lets them resend the link inline and come back, instead of
  // bouncing to their inbox, hunting for an old email, and losing the brief.
  const [resendingVerify, setResendingVerify] = useState(false);
  const userEmailUnverified = !!user && !isEmailVerified({ user } as any);

  // On mount: restore a brief persisted across Google OAuth if one is pending.
  // This lets signed-out hirers fill the whole wizard, bounce through auth, and
  // land right back on Step 3 with every field intact — no re-entry, no extra
  // clicks.
  const briefRestoredRef = useRef(false);
  const [briefJustRestored, setBriefJustRestored] = useState(false);
  // Auto-pay intent captured at brief-restore time. Set when the user clicked
  // "Match me with AI — €1" or "Free hand-pick" before being bounced to OAuth.
  // A second useEffect (below) waits for `user` to load, then fires the
  // appropriate handler exactly once. Stripe still requires a final "Pay"
  // click in its own iframe — we're skipping the redundant tap of our button,
  // not charging without consent.
  const [autoPayIntent, setAutoPayIntent] = useState<'ai' | 'vano' | null>(null);
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
      setBriefJustRestored(true);
      // Single-use read of the intent flag — clears immediately so a refresh
      // or remount can never re-fire the handler.
      const intent = consumeHireBriefAutoPay();
      if (intent === 'vano') {
        setAutoPayIntent('vano');
        toast({
          title: 'Welcome back',
          description: 'Resuming your match — sending your brief now.',
        });
      } else {
        toast({
          title: 'Welcome back',
          description: 'Your brief is ready — review it, then tap Find my match to continue.',
        });
      }
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
        // `subtypes` is a `readonly` tuple of literal strings thanks to
        // `as const`, so the strict `includes` signature rejects a
        // runtime `string`. Widen it here — we've already guarded
        // non-empty + the values are hard-coded so a bogus param
        // simply fails the check.
        if (st && (found.subtypes as readonly string[]).includes(st)) {
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

  // Post-OAuth auto-trigger. Fires exactly once when:
  //   1. The brief was just restored from a signed-out submit attempt
  //   2. The user is now signed in (so the handler will skip its own
  //      signed-out OAuth-redirect branch and go straight to the real flow)
  //   3. An auto-pay intent flag was captured (only set when the user
  //      clicked Match me / Free hand-pick before being bounced)
  // Setting autoPayIntent back to null after firing prevents a re-fire
  // if `user` flips (e.g. token refresh emits a new session reference).
  useEffect(() => {
    if (!autoPayIntent || !user) return;
    setAutoPayIntent(null);
    void handleVanoSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPayIntent, user]);

  const goTo = (s: number) => {
    setStepDirection(s > step ? 1 : -1);
    setStep(s);
  };

  const handleCategoryPick = (id: string) => {
    setCategory(id);
    // Always reset sub-type + style-tag when switching categories —
    // stale chips from a different category would silently feed into
    // the synthesized description and mis-score the match.
    setSubtype(null);
    setStyleTag(null);
  };

  // `fetchMatches()` used to live here — fetched approved freelancers
  // on Step 3 mount and stored them in state. Removed with the
  // matched* state above (2026-04-23): nothing in the render ever
  // displayed the results. The real matching happens after payment
  // inside AiFindResults / AiFindReturn.

  /* ── Submit Vano request ── */
  // `autoOpenWhatsApp` is false when this runs automatically after a Google
  // OAuth resume — browsers block `window.open` without a direct user click,
  // and the submitted-state UI already surfaces a WhatsApp button.
  const handleVanoSubmit = async (autoOpenWhatsApp = true) => {
    if (!user) {
      // Persist the brief + auto-pay intent so the post-OAuth return can
      // re-fire this handler automatically — the user explicitly tapped
      // "send", they shouldn't have to tap it again after Google bounces
      // them back. The 'vano' intent flag is single-use (consumed on the
      // next page load), so a refresh after submission won't re-fire.
      saveHireBrief({ description, category, subtype, timeline, budget }, 'vano');
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
            queryParams: { access_type: 'offline', prompt: 'select_account' },
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
      void resendVerifyEmail(user.email ?? null, toast);
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
      }).catch((err) => {
        // Don't toast — the hire_requests row already landed, WhatsApp
        // already opened. This is just the team's admin email/push;
        // surface to Sentry so we notice if it's silently broken.
        console.warn('[HirePage] notify-hire-request failed', err);
      });
    }
    setSubmitting(false);
  };


  // (Removed: Step-3 fetchMatches effect. See the comment block above
  // `const [user, setUser] = ...` for context — Step 3 used to fetch
  // freelancer previews that were never rendered.)

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

  /* Step 1 → 2 used to auto-advance 220ms after a sub-type pick. That took
   * the "Add any extra detail" textarea away before the user even saw it,
   * and the micro-hijack felt like a routing bug to first-timers. Removed —
   * the Continue button is front-and-centre, glowing once Step 1 unlocks. */

  // Step 1 unlocks when the user has chosen a category AND either picked a
  // sub-type chip (frictionless click path) or typed a short free-form hint
  // for the "Other" branch which has no sub-types.
  const canProceedStep1 = !!category && (
    !!subtype ||
    (category === 'other' && description.trim().length >= 5)
  );
  const canProceedStep2 = !!timeline && !!budget;

  /* Enter-to-continue — keyboard users on desktop can hit Return to
   * advance Step 1 → 2 and 2 → 3 without mousing to the Continue pill.
   * Step 3 is intentionally excluded: pressing Enter must NEVER trigger
   * the €1 payment, otherwise an accidental keypress while a hirer is
   * reading the recap could charge them. Guards:
   *   - skip when a textarea has focus (Enter adds a newline there)
   *   - skip when a button/link is focused (native Enter clicks it)
   *   - skip when inside a Radix Select or combobox so Enter keeps its
   *     native "select this option" behaviour
   */
  useEffect(() => {
    if (step !== 1 && step !== 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase();
      if (tag === 'TEXTAREA') return;
      if (tag === 'BUTTON' || tag === 'A') return;
      if (target?.closest('[role="combobox"]') || target?.closest('[role="listbox"]')) return;
      if (step === 1 && canProceedStep1) {
        e.preventDefault();
        goTo(2);
      } else if (step === 2 && canProceedStep2) {
        e.preventDefault();
        goTo(3);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canProceedStep1, canProceedStep2]);

  // Canonical description built from the chips. The textarea is optional
  // extra detail; if it's empty, downstream consumers still get
  // "Video — Reel / short-form" etc. Satisfies the NOT NULL constraint on
  // hire_requests.description.
  const buildDescription = (): string => {
    const catLabel = category ? CATEGORY_LABEL[category] : '';
    const parts: string[] = [];
    if (catLabel && subtype) parts.push(`${catLabel} — ${subtype}`);
    else if (catLabel) parts.push(catLabel);
    // Style-tag goes into the brief as a "Style: X" sentence. The
    // matcher tokenizes on word boundaries, so "Cinematic" becomes a
    // match token that boosts freelancers with "cinematic" in their
    // skills. No schema change needed — it rides along in the
    // existing `brief` column.
    if (styleTag) parts.push(`Style: ${styleTag}`);
    // "Who's it for?" adds context the freelancer reads first. Also a
    // free signal to the matcher's tokenizer.
    if (audience) parts.push(`For: ${audience}`);
    const extra = description.trim();
    if (extra) parts.push(extra);
    return parts.join('. ') || extra || catLabel || 'New hire request';
  };

  // Short recap shown on Steps 2 and 3 above the header.
  const recap = (() => {
    const catLabel = category ? CATEGORY_LABEL[category] : '';
    const extra = description.trim();
    const styleBit = styleTag ? ` · ${styleTag}` : '';
    if (catLabel && subtype) return `${catLabel} — ${subtype}${styleBit}${extra ? ` · ${extra}` : ''}`;
    return `${catLabel}${styleBit}` || extra || catLabel || '';
  })();

  /* ── Render helpers ── */

  const renderStep1 = () => (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          What are you working on?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          Pick a category — we'll take it from there.
        </p>
      </header>

      {/* Category image cards — visual, tappable, same image assets as the landing page */}
      <div className="grid grid-cols-2 gap-2.5 mb-5 sm:gap-3">
        {CATEGORIES.filter(c => c.id !== 'other').map(cat => {
          const Icon = cat.icon;
          const active = category === cat.id;
          const slug = cat.id;
          return (
            <motion.button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryPick(cat.id)}
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className={cn(
                'group relative overflow-hidden flex flex-col justify-end rounded-2xl border text-left cursor-pointer select-none h-[100px] sm:h-[116px] transition-[border-color,box-shadow] duration-200',
                active
                  ? 'border-primary ring-2 ring-primary shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)]'
                  : 'border-foreground/10 hover:border-foreground/20 hover:shadow-tinted-lg',
              )}
            >
              {/* Background image */}
              <picture className="absolute inset-0 h-full w-full pointer-events-none">
                <source
                  type="image/webp"
                  srcSet={`/cat-${slug}-400.webp 400w, /cat-${slug}-800.webp 800w`}
                  sizes="(max-width: 640px) 50vw, 25vw"
                />
                <img
                  src={`/cat-${slug}.png`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </picture>
              {/* Dark wash */}
              <div className="absolute inset-0 bg-gradient-to-t from-[hsl(25_30%_8%/0.72)] via-[hsl(25_30%_8%/0.28)] to-transparent" />
              {/* Active tint */}
              {active && <div className="absolute inset-0 bg-primary/20" />}
              {/* Content */}
              <div className="relative z-10 p-3 sm:p-4">
                <div className={cn(
                  'mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                  active ? 'bg-primary/90' : 'bg-white/20 group-hover:bg-white/30',
                )}>
                  <Icon size={14} className="text-white" strokeWidth={2} />
                </div>
                <p className="text-[13px] sm:text-[14px] font-semibold text-white leading-tight drop-shadow-sm">{cat.label}</p>
              </div>
              {/* Active check — bounces in when card is selected */}
              {active && (
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-sm"
                >
                  <Check size={11} strokeWidth={3} />
                </motion.div>
              )}
            </motion.button>
          );
        })}
        {/* Other — smaller pill at the end */}
        {(() => {
          const other = CATEGORIES.find(c => c.id === 'other');
          if (!other) return null;
          const Icon = other.icon;
          const active = category === other.id;
          return (
            <motion.button
              key="other"
              type="button"
              onClick={() => handleCategoryPick('other')}
              whileTap={{ scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className={cn(
                'col-span-2 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold cursor-pointer select-none transition-[border-color,background-color,color] duration-150',
                active ? 'border-primary bg-primary/8 text-primary' : 'border-foreground/10 bg-card text-foreground hover:border-foreground/20 hover:bg-foreground/[0.025]',
              )}
            >
              <Icon size={16} className={active ? 'text-primary' : 'text-muted-foreground'} />
              Something else
            </motion.button>
          );
        })()}
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
                  <motion.button
                    key={st}
                    type="button"
                    onClick={() => setSubtype(st)}
                    whileTap={{ scale: 0.93 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className={cn(
                      'rounded-full border px-5 py-3 sm:px-6 sm:py-3.5 text-sm sm:text-base font-semibold cursor-pointer select-none transition-[border-color,background-color,color,box-shadow] duration-150',
                      active ? 'border-primary bg-primary text-primary-foreground shadow-md' : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
                    )}
                  >
                    {st}
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Style / vibe / platform chips — optional. Surfaces only once
          the user has picked a sub-type, so Step 1 still feels fast for
          the truly decisive. The label and options are category-aware
          (STYLE_TAGS / STYLE_TAG_PROMPTS consts at the top of the file).
          Picking a chip appends "Style: X" to the brief, boosting any
          freelancer whose skills/title tokens overlap with the chip
          word — zero matcher change needed. */}
      {category && subtype && STYLE_TAGS[category] && STYLE_TAGS[category].length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {STYLE_TAG_PROMPTS[category]}
            <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
              (optional — helps us match the right feel)
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            {STYLE_TAGS[category].map((tag) => {
              const active = styleTag === tag;
              return (
                <motion.button
                  key={tag}
                  type="button"
                  onClick={() => setStyleTag(active ? null : tag)}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium cursor-pointer select-none transition-[border-color,background-color,color] duration-150',
                    active
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                  )}
                >
                  {tag}
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional scratch space for extra context.
          - "Other" category → always visible, solid card (it IS the input).
          - Known category → collapsed behind a disclosure so the chips +
            Continue read as the full flow. Auto-expands if the user has
            already typed (e.g. restored brief). */}
      {category === 'other' ? (
        <div className="rounded-2xl bg-card overflow-hidden transition-all duration-300 border border-foreground/6 shadow-tinted focus-within:border-primary/20 focus-within:shadow-tinted-lg">
          <div className="flex items-center justify-between px-4 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Tell us what you need
            </p>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe what you need — the more specific, the better match we can find."
            className="w-full resize-none bg-transparent px-4 pt-2 pb-3 leading-relaxed text-foreground placeholder:text-muted-foreground/45 focus:outline-none min-h-[96px] lg:min-h-[120px] text-[15px] sm:text-base"
          />
        </div>
      ) : (
        // "Add context" textarea is always inline now — the old
        // disclosure button hid deadlines / brand / examples behind
        // a click most first-time hirers never discovered, costing
        // match quality silently. The field still reads as optional
        // via the label + placeholder; the textarea compact-collapses
        // to a single line until focused so the step doesn't bloat.
        <div className="rounded-2xl bg-card overflow-hidden border border-dashed border-foreground/10 shadow-sm focus-within:border-primary/25 focus-within:border-solid">
          <div className="flex items-center justify-between px-4 pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Add any extra detail
              <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/60">(optional)</span>
            </p>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Deadline, brand, examples, anything a freelancer should know upfront…"
            className="w-full resize-none bg-transparent px-4 pt-2 pb-3 leading-relaxed text-sm text-foreground placeholder:text-muted-foreground/45 focus:outline-none min-h-[56px] focus:min-h-[88px] transition-all"
          />
        </div>
      )}

      {/* Value props — brand-aligned with Landing + escrow positioning.
           Previous copy ("Student-friendly prices · Motivated talent")
           was off-message post-repositioning; it sold cheap labour
           instead of "hand-picked perfect match held safely until
           you release". */}
      <div className="mt-6 grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { icon: Sparkles, label: 'Hand-picked', sub: 'Just one — the right one' },
          { icon: Zap, label: '20-second match', sub: 'Not 60 applications' },
          { icon: ShieldCheck, label: 'Pay safely', sub: 'Refund if not done' },
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

      <motion.button
        type="button"
        onClick={() => goTo(2)}
        disabled={!canProceedStep1}
        animate={canProceedStep1
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0.55, y: 4, scale: 0.98 }}
        whileHover={canProceedStep1 ? { y: -2, transition: { duration: 0.15 } } : {}}
        whileTap={canProceedStep1 ? { scale: 0.97 } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className={cn(
          'mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 sm:py-4 text-sm sm:text-base font-semibold cursor-pointer select-none',
          canProceedStep1
            ? 'bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] animate-glow-pulse'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
      >
        Looks good — next step <ArrowRight size={15} />
      </motion.button>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <button
        type="button"
        onClick={() => goTo(1)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.97]"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">Now let's sort the details.</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          When do you need it, and what's your budget? We'll find someone who fits.
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
            <motion.button
              key={t.id}
              type="button"
              onClick={() => setTimeline(t.id)}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 480, damping: 20 }}
              className={cn(
                'relative z-10 flex flex-col items-center gap-1 rounded-xl border px-3 py-3.5 sm:py-4 cursor-pointer select-none transition-[border-color,background-color,color] duration-150',
                timeline === t.id
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              <span className="text-base" aria-hidden="true">{t.emoji}</span>
              <span className="text-sm sm:text-base font-semibold">{t.label}</span>
              <span className={cn('text-[10px] sm:text-[11px]', timeline === t.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{t.sub}</span>
            </motion.button>
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
            <motion.button
              key={b.id}
              type="button"
              onClick={() => setBudget(b.id)}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 480, damping: 20 }}
              className={cn(
                'relative z-10 flex flex-col items-center gap-1 rounded-xl border px-3 py-3.5 sm:py-4 cursor-pointer select-none transition-[border-color,background-color,color] duration-150',
                budget === b.id
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5'
              )}
            >
              <span className="text-base" aria-hidden="true">{b.emoji}</span>
              <span className="text-sm sm:text-base font-semibold">{b.label}</span>
              <span className={cn('text-[10px] sm:text-[11px]', budget === b.id ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{b.sub}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Who's it for? — optional audience chip. Not a required field
           (some hirers don't want to categorise themselves); tapping
           gives the matcher + the freelancer extra context about the
           project before they reply. Renders after Budget so the
           user's established the concrete bits first, then answers
           the softer question. */}
      <div className="mb-5">
        <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Who's it for?
          <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
            (optional)
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {['Me', 'My business', 'My brand', 'A client', 'An event'].map((label) => {
            const active = audience === label;
            return (
              <motion.button
                key={label}
                type="button"
                onClick={() => setAudience(active ? null : label)}
                whileTap={{ scale: 0.92 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium cursor-pointer select-none transition-[border-color,background-color,color] duration-150',
                  active
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                )}
              >
                {label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Reassurance — brand-aligned: the promise is "any budget, your
           perfect match" not "cheap student labour". */}
      <p className="text-center text-[11px] sm:text-xs text-muted-foreground mb-4">
        Whatever your budget, we hand-pick who fits.
      </p>

      <motion.button
        type="button"
        onClick={() => goTo(3)}
        disabled={!canProceedStep2}
        animate={canProceedStep2
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0.55, y: 4, scale: 0.98 }}
        whileHover={canProceedStep2 ? { y: -2, transition: { duration: 0.15 } } : {}}
        whileTap={canProceedStep2 ? { scale: 0.97 } : {}}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 sm:py-4 text-sm sm:text-base font-semibold cursor-pointer select-none',
          canProceedStep2
            ? 'bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] animate-glow-pulse'
            : 'bg-muted text-muted-foreground cursor-not-allowed'
        )}
      >
        Find my match <ArrowRight size={15} />
      </motion.button>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <button
        type="button"
        onClick={() => goTo(2)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary/5 active:scale-[0.97]"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          Nearly there — we'll find your person.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          The Vano team hand-picks the best-fit freelancer from our talent pool and sends them to your messages within 24 hours. Free.
        </p>
        <div className="mt-3">
          <LiveMatchesCounter />
        </div>
      </header>

      {briefJustRestored && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 size={14} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Picking up where you left off</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Your brief is restored. Review it below, then tap <span className="font-medium text-foreground">Find my match</span> to continue.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBriefJustRestored(false)}
            aria-label="Dismiss"
            className="mt-0.5 text-muted-foreground/60 transition hover:text-foreground"
          >
            <span className="block h-4 w-4 rounded-full text-center text-[11px] leading-4">×</span>
          </button>
        </div>
      )}

      {userEmailUnverified && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
            <MailWarning size={14} className="text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Verify your email to continue</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              {user?.email ? <>We sent a link to <span className="font-medium text-foreground">{user.email}</span>. </> : null}
              Tap it, then come back here.
            </p>
            <button
              type="button"
              disabled={resendingVerify}
              onClick={async () => {
                if (!user?.email || resendingVerify) return;
                setResendingVerify(true);
                try {
                  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
                  if (error) throw error;
                  toast({ title: 'Verification email sent', description: `Check ${user.email} — then come back and tap Find my match.` });
                } catch (err) {
                  console.warn('[HirePage] inline resend failed', err);
                  toast({ title: 'Could not resend', description: 'Please try again in a moment.', variant: 'destructive' });
                } finally {
                  setResendingVerify(false);
                }
              }}
              className="mt-1.5 text-[12px] font-semibold text-amber-700 underline underline-offset-2 hover:no-underline disabled:opacity-50 dark:text-amber-400"
            >
              {resendingVerify ? 'Sending…' : 'Resend verification email'}
            </button>
          </div>
        </div>
      )}

      {!submitted ? (
        <div className="overflow-hidden rounded-[24px] border border-primary/20 bg-card shadow-tinted-lg">
          {/* Header */}
          <div className="border-b border-foreground/[0.06] px-6 pt-6 pb-5">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Vano hand-pick · Free · 24h
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">
              We'll find the right person for you.
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              The Vano team personally reviews your brief and picks the best-fit freelancer from our pool — no algorithm, no queue.
            </p>
          </div>

          {/* Brief recap */}
          <div className="border-b border-foreground/[0.06] px-6 py-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
                You asked for
              </span>
              {[
                category && CATEGORIES.find(c => c.id === category)?.label,
                subtype,
                styleTag,
                audience,
                timeline && TIMELINES.find(t => t.id === timeline)?.label,
                budget && BUDGETS.find(b => b.id === budget)?.label,
              ].filter(Boolean).map(tag => (
                <span key={tag as string} className="inline-block rounded-full bg-primary/[0.08] px-2.5 py-0.5 text-[10.5px] font-medium text-primary">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="px-6 py-5">
            <motion.button
              data-mascot="hire-submit"
              type="button"
              onClick={() => { void handleVanoSubmit(); }}
              disabled={submitting}
              whileHover={!submitting ? { y: -2, transition: { duration: 0.15 } } : {}}
              whileTap={!submitting ? { scale: 0.97 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-[15px] font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] cursor-pointer select-none disabled:cursor-wait disabled:opacity-80"
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Sending your brief…</>
              ) : (
                <>Find my match — it's free <ArrowRight size={15} /></>
              )}
            </motion.button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              No payment · no commitment · chat first, then decide
            </p>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-50/80 to-background dark:from-emerald-900/20 dark:to-background px-6 py-8 text-center">
          <div className="grain pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />
          <div className="relative">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/12 ring-8 ring-emerald-500/8 animate-bounce-in">
              <CheckCircle2 size={34} className="text-emerald-600" strokeWidth={1.75} />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              You're all sorted. 🎉
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Your brief is with the Vano team. We'll hand-pick the right person and send them to your{' '}
              <button type="button" onClick={() => navigate('/messages')} className="font-semibold text-primary underline underline-offset-2 hover:no-underline">Messages</button>{' '}
              within 24 hours. You'll get an email too — check your inbox.
            </p>
            <div className="mx-auto mt-6 max-w-xs space-y-2.5 text-left">
              {[
                { step: '1', text: 'We review your brief and find the best fit' },
                { step: '2', text: 'We open a thread — you message, agree a rate' },
                { step: '3', text: 'Pay safely through Vano — released when you\'re happy' },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                    {item.step}
                  </span>
                  <p className="text-[12.5px] text-muted-foreground leading-snug">{item.text}</p>
                </div>
              ))}
            </div>
            <a
              href={teamWhatsAppHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-5 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 transition hover:bg-emerald-500/15 active:scale-[0.98]"
            >
              <MessageCircle size={15} /> Message us on WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-12">
      <SEOHead
        title="Hire a Trusted Freelancer — Post a Brief"
        description="Tell VANO what you need. Get matched with affordable, motivated freelance talent in seconds — digital sales, videography, web, social and more."
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

      </div>

      {/* Mobile sticky CTA — keeps the primary action one tap away
           on long-scrolling mobile screens. Hidden after submit. */}
      {step === 3 && !submitted && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/92 backdrop-blur-md md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto max-w-2xl px-4 py-3">
            <button
              type="button"
              onClick={() => { void handleVanoSubmit(); }}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {submitting ? (
                <><Loader2 size={15} className="animate-spin" /> Sending…</>
              ) : (
                <><Sparkles size={15} /> Find my match — it's free</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HirePage;
