import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Navbar } from '@/components/Navbar';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isEmailVerified } from '@/lib/authSession';
import { teamWhatsAppHref } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { clearHireBrief, loadHireBrief, saveHireBrief } from '@/lib/hireFlow';
import { setGoogleOAuthIntent } from '@/lib/googleOAuth';
import { getAuthRedirectUrl } from '@/lib/siteUrl';
import { markUserActed } from '@/lib/userActivity';
import { diagnoseAuthFailure } from '@/lib/authDiagnose';
import {
  ArrowRight, ArrowLeft, Sparkles, MessageCircle,
  Video, TrendingUp, Monitor, Megaphone, HelpCircle,
  Clock, Loader2, CheckCircle2, Euro,
  Shield, ShieldCheck, Zap, Check, ChevronDown, MailWarning,
} from 'lucide-react';
import { JourneyMap, HIRE_JOURNEY_STEPS } from '@/components/JourneyMap';
import { AiFindCheckoutModal } from '@/components/AiFindCheckoutModal';
import { hasStripePublishableKey } from '@/lib/stripeClient';
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
  { id: 'unsure', label: 'I want a quote', sub: "We'll advise" },
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
  // Separate loading flag so the €1 AI Find button can spin without
  // freezing the primary "Send request to Vano" CTA.
  const [aiFindLoading, setAiFindLoading] = useState(false);
  // Embedded-checkout state. client_secret comes back from the edge
  // function when ui_mode='embedded'; we mount the modal with it so
  // Stripe can render the checkout UI inline instead of redirecting
  // the whole page. fallback_url is the hosted-mode URL kept around
  // for "Open in new tab" on iframe-blocked browsers.
  const [aiFindCheckoutOpen, setAiFindCheckoutOpen] = useState(false);
  const [aiFindClientSecret, setAiFindClientSecret] = useState<string | null>(null);
  const [aiFindFallbackUrl, setAiFindFallbackUrl] = useState<string | null>(null);
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
      // Post-OAuth breadcrumb. Without this the user lands on Step 3 with
      // their fields magically restored and no acknowledgement that
      // anything happened — felt like a routing bug. Now they see a brief
      // confirmation and the onus is on them to tap the €1 button (the
      // previous auto-submit was a real UX trap that could charge a user
      // who had no idea what they were clicking through to).
      toast({
        title: 'Welcome back',
        description: 'Your brief is ready — review it, then tap Match me to continue.',
      });
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

  // €1 AI Find — secondary CTA on Step 3. Creates an ai_find_requests
  // row via the create-ai-find-checkout edge function, then bounces the
  // user to Stripe Checkout. Payment confirmation happens server-side
  // in stripe-webhook; the success_url drops them on /ai-find/:id which
  // polls until the AI picks are ready.
  const handleAiFind = async () => {
    if (!user) {
      // Same OAuth round-trip as Vano Match so signed-out hirers can
      // discover the €1 product without the friction of bouncing
      // through /auth manually. Brief is saved and Step 3 resumes
      // intact on return; they tap AI Find again to go to Stripe.
      saveHireBrief({ description, category, subtype, timeline, budget });
      if (isInAppBrowser()) {
        track('in_app_browser_blocked', { source: 'hire_ai_find_signedout' });
        toast({
          title: "Can't sign in here",
          description: "Open this page in Safari or Chrome — your brief is saved.",
          variant: 'destructive',
        });
        return;
      }
      setGoogleOAuthIntent('business');
      // Flip aiFindLoading so the €1 button shows "Taking you to Google…"
      // instead of standing idle while the redirect kicks in. Without
      // this the page just freezes for a beat and the user wonders if
      // their tap registered.
      setAiFindLoading(true);
      toast({
        title: 'Saving your brief…',
        description: "We'll bring you right back to finish.",
      });
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: getAuthRedirectUrl(),
            queryParams: { access_type: 'offline', prompt: 'select_account' },
          },
        });
        if (error) throw error;
      } catch {
        clearHireBrief();
        setAiFindLoading(false);
        toast({ title: 'Sign-in failed', description: 'Please try again.', variant: 'destructive' });
      }
      return;
    }
    if (!isEmailVerified({ user } as any)) {
      void resendVerifyEmail(user.email ?? null, toast);
      return;
    }
    if (aiFindLoading) return;

    setAiFindLoading(true);
    try {
      const finalDescription = buildDescription();
      // Persist the brief before the redirect / modal opens so a
      // Stripe abandon (3DS, network drop, payment declined) lands
      // the user back on /hire with their work intact instead of a
      // blank wizard.
      saveHireBrief({ description, category, subtype, timeline, budget });

      // Session check is still useful so we don't insert as anon and
      // hit a redirect-to-Stripe with no row tied to the user. Fresh
      // refresh covers the "tab backgrounded, token stale in
      // localStorage" case on mobile.
      await supabase.auth.refreshSession().catch(() => { /* fall through */ });
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) {
        toast({
          title: 'Your sign-in expired',
          description: 'Please sign in again — your brief is saved.',
          variant: 'destructive',
        });
        setAiFindLoading(false);
        navigate('/auth');
        return;
      }

      // Payment Link flow. We bypass the create-ai-find-checkout edge
      // function entirely because the Supabase functions gateway has
      // been rejecting JWTs (UNAUTHORIZED_INVALID_JWT_FORMAT) — see
      // 20260422120000_ai_find_client_insert.sql. Instead:
      //   1. Insert the ai_find_requests row directly via RLS.
      //   2. Redirect to a pre-configured Stripe Payment Link with
      //      client_reference_id=<row id>. stripe-webhook picks that up
      //      and flips the row to 'paid' + fires ai-find-freelancer,
      //      same as before.
      //   3. Stash the row id in localStorage so /ai-find-return can
      //      bounce the user to /ai-find/:id on success (Payment Links
      //      can't templatize arbitrary path segments into the return
      //      URL, only {CHECKOUT_SESSION_ID}).
      const paymentLinkBase =
        (import.meta.env.VITE_STRIPE_AI_FIND_PAYMENT_LINK as string | undefined)?.trim();
      if (!paymentLinkBase) {
        toast({
          title: "Payments aren't configured yet",
          description:
            "Message us on WhatsApp and we'll find your match manually — your brief is saved.",
          variant: 'destructive',
        });
        setAiFindLoading(false);
        return;
      }

      // Resume in-flight rows instead of creating a duplicate. If the
      // user came back from Stripe via an unlucky path (webhook lag,
      // localStorage cleared, in-app browser hand-off) /ai-find-return
      // would previously dump them on /hire — and re-clicking AI Find
      // would create a NEW row and NEW Stripe session, charging them
      // twice. Now: if they have a non-terminal row from the last 30
      // minutes, route them to its results page instead.
      const RESUME_WINDOW_MS = 30 * 60 * 1000;
      const resumeAfter = new Date(Date.now() - RESUME_WINDOW_MS).toISOString();
      const { data: existing } = await supabase
        .from('ai_find_requests')
        .select('id, status')
        .eq('requester_id', userId)
        .in('status', ['awaiting_payment', 'paid', 'scouting', 'complete'])
        .gte('created_at', resumeAfter)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const existingStatus = existing.status as string;
        if (existingStatus === 'awaiting_payment') {
          // They opened a request but never finished paying. Resume
          // the SAME row through Stripe instead of inserting a new
          // one — same client_reference_id so the webhook ties the
          // payment back to it, no double-charge. AiFindResults will
          // self-heal once they come back through /ai-find-return
          // (which drops the trust token).
          const paymentLinkBase =
            (import.meta.env.VITE_STRIPE_AI_FIND_PAYMENT_LINK as string | undefined)?.trim();
          if (paymentLinkBase) {
            try { localStorage.setItem('vano_ai_find_pending_id', existing.id as string); } catch { /* ignore */ }
            const linkUrl = new URL(paymentLinkBase);
            linkUrl.searchParams.set('client_reference_id', existing.id as string);
            const userEmail = sessionData.session?.user?.email;
            if (userEmail) linkUrl.searchParams.set('prefilled_email', userEmail);
            window.location.href = linkUrl.toString();
            return;
          }
        }
        // paid / scouting / complete — payment is server-confirmed,
        // just show the results page.
        try { localStorage.setItem('vano_ai_find_pending_id', existing.id as string); } catch { /* ignore */ }
        navigate(`/ai-find/${existing.id}`);
        return;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('ai_find_requests')
        .insert({
          requester_id: userId,
          brief: finalDescription,
          category,
          budget_range: budget,
          timeline,
          amount_eur: 1,
          status: 'awaiting_payment',
        })
        .select('id')
        .single();

      if (insertErr || !inserted?.id) {
        console.error('[ai-find] insert failed', insertErr);
        throw new Error(insertErr?.message || 'Could not start your request.');
      }

      const requestId = inserted.id as string;

      // Persist for /ai-find-return fallback. The success URL on the
      // Payment Link is a single static path; we need this to route
      // back to the correct results page after Stripe bounces the user.
      try {
        localStorage.setItem('vano_ai_find_pending_id', requestId);
      } catch { /* private-mode Safari etc. — non-fatal */ }

      track('ai_find_checkout_started', {
        category, timeline, budget,
        ui_mode: 'payment_link',
      });

      // Compose the Payment Link URL. client_reference_id is the
      // contract with stripe-webhook; Stripe forwards it verbatim on
      // the checkout.session.completed event.
      const linkUrl = new URL(paymentLinkBase);
      linkUrl.searchParams.set('client_reference_id', requestId);
      const userEmail = sessionData.session?.user?.email;
      if (userEmail) linkUrl.searchParams.set('prefilled_email', userEmail);

      window.location.href = linkUrl.toString();
      return;
    } catch (err) {
      console.error('[ai-find] checkout failed', err);
      // Pull the server-side message via several fallbacks. Supabase
      // functions.invoke wraps the edge-function JSON error under
      // `context.error`; other throw paths surface via `.message`.
      // Also pull the HTTP status where we can so "500 Unexpected
      // error" and "400 Brief is too short" are distinguishable on
      // screen.
      const ctxErr = (err as { context?: { error?: string } })?.context?.error;
      const status = (err as { status?: number; context?: { status?: number } })?.status
        ?? (err as { context?: { status?: number } })?.context?.status;
      const rawMsg = ctxErr || (err as { message?: string })?.message || '';
      const statusLine = status ? `[${status}] ` : '';
      // A bare 401/403 almost always means the edge-function gateway
      // rejected the JWT — map it to a sign-in prompt instead of the
      // raw "non-2xx" gibberish the user otherwise sees.
      const isAuthFailure = status === 401 || status === 403
        || rawMsg.toLowerCase().includes('unauthorized');
      const friendly =
        isAuthFailure
          ? 'Your sign-in expired — please sign in again and try once more.'
        : rawMsg.includes('STRIPE_SECRET_KEY')
          ? "Payments aren't configured yet — message us on WhatsApp and we'll find your match manually."
        : rawMsg.toLowerCase().includes('brief')
          ? rawMsg
        : rawMsg.toLowerCase().includes('forbidden origin')
          ? 'Origin not allowed — if this is a preview URL, add it to the Supabase ALLOWED_ORIGINS env var.'
        : rawMsg
          // Show the raw edge-fn error when we don't have a better
          // match; otherwise the user sees "try again" forever with
          // no actionable signal. Truncate so a stack trace doesn't
          // dominate the toast.
          ? `${statusLine}${rawMsg.slice(0, 200)}`
        : 'Please try again in a moment, or use the free Vano Match button above.';
      // If the gateway rejected with 401/403, try to diagnose why —
      // an env mismatch (VITE_SUPABASE_URL project ≠ session project)
      // produces the same status as a stale token but with completely
      // different remediation, so surfacing the actual cause beats a
      // generic "sign in again" nudge.
      const diag = isAuthFailure ? await diagnoseAuthFailure() : null;
      toast({
        title: "Couldn't start AI Find",
        description: diag ?? friendly,
        variant: 'destructive',
      });
      setAiFindLoading(false);
      // Don't auto sign-out on 401/403 here — production hit a case
      // where the Vercel env had mismatched VITE_SUPABASE_URL /
      // VITE_SUPABASE_PUBLISHABLE_KEY (pointing at different Supabase
      // projects), which produces the same gateway 401 but a fresh
      // sign-in can't recover it. Auto-kicking just traps the user in
      // a sign-in loop. The toast tells them what to do; let them drive.
    }
  };

  /* Previously this auto-fired handleVanoSubmit(false) once the post-OAuth
   * brief was restored and the session was live — the intent was "pick up
   * exactly where you left off." But that pipeline went Google → site root →
   * Step 3 → Stripe checkout in ~3 seconds, so a first-time hirer was charged
   * €1 without any chance to review their brief. Removed. The user now lands
   * on Step 3 with everything filled in + a "Welcome back" toast, and they
   * tap the same €1 button they would have tapped before OAuth. One extra
   * click in exchange for not mugging people mid-redirect is a great trade. */

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
                <button
                  key={tag}
                  type="button"
                  onClick={() => setStyleTag(active ? null : tag)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition-all cursor-pointer select-none active:scale-[0.97]',
                    active
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                  )}
                >
                  {tag}
                </button>
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
          { icon: Sparkles, label: 'Hand-picked', sub: 'One perfect match' },
          { icon: Zap, label: '60-second match', sub: 'Not 60 applications' },
          { icon: ShieldCheck, label: 'Pay safely', sub: 'Held until released' },
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
        'mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 sm:py-4 text-sm sm:text-base font-semibold transition-all duration-150 cursor-pointer select-none active:translate-y-0 active:scale-[0.99]',
        canProceedStep1
          ? 'bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] hover:-translate-y-[1px] hover:brightness-[1.05]'
          : 'bg-muted text-muted-foreground cursor-not-allowed'
      )}>
        Continue <ArrowRight size={15} />
      </button>
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
              <button
                key={label}
                type="button"
                onClick={() => setAudience(active ? null : label)}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-all cursor-pointer select-none active:scale-[0.97]',
                  active
                    ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reassurance — brand-aligned: the promise is "any budget, your
           perfect match" not "cheap student labour". */}
      <p className="text-center text-[11px] sm:text-xs text-muted-foreground mb-4">
        Whatever your budget, we hand-pick who fits.
      </p>

      <button type="button" onClick={() => goTo(3)} disabled={!canProceedStep2} className={cn(
        'flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 sm:py-4 text-sm sm:text-base font-semibold cursor-pointer select-none transition-all duration-150 active:translate-y-0 active:scale-[0.99]',
        canProceedStep2
          ? 'bg-primary text-primary-foreground shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.5)] hover:-translate-y-[1px] hover:brightness-[1.05]'
          : 'bg-muted text-muted-foreground cursor-not-allowed'
      )}>
        Match me with a freelancer <ArrowRight size={15} />
      </button>
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
          Match me with a freelancer
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed sm:text-base">
          €1 now, vetted match in 60 seconds. Refunded if we don't find one.
        </p>
      </header>

      {/* Persistent resume chip. The "Welcome back" toast disappears in a
           few seconds, so after a restored-brief return (Stripe abandon,
           OAuth round-trip) the user loses the only signal that their work
           was saved. This chip stays until they click it or dismiss. */}
      {briefJustRestored && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 size={14} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">Picking up where you left off</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Your brief is restored. Review it below, then tap <span className="font-medium text-foreground">Match me</span> to continue.
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

      {/* Pre-flight email-verification banner. Surfaces BEFORE the user
           taps €1 so they don't fill the wizard, get a destructive toast,
           and have to leave the page to find an old verification email.
           Inline resend keeps them on /hire — they verify in another tab,
           come back, and tap. */}
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
                  toast({
                    title: 'Verification email sent',
                    description: `Check ${user.email} — then come back and tap Match me.`,
                  });
                } catch (err) {
                  console.warn('[HirePage] inline resend failed', err);
                  toast({
                    title: 'Could not resend',
                    description: 'Please try again in a moment.',
                    variant: 'destructive',
                  });
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

      {/* ── PRIMARY HERO — €1 AI Find ──
           This is the offer the whole site narrates toward. Big, confident,
           amber-gold premium ring. Spells out the full pipeline
           (pay → match → chat → pay via Vano) inside the card so hirers
           know where €1 sits in the story before they commit. */}
      <div>
        {!submitted ? (
          <div className="relative overflow-hidden rounded-[24px] border border-primary/30 bg-gradient-to-b from-primary to-primary/95 text-white shadow-primary-glow">
            {/* Single radial mesh light source — replaces the side blob
                 with an off-axis sun. Suggests one direction of light
                 instead of "blob in corner", which is the AI tic. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(60% 45% at 80% 12%, hsl(45 100% 80% / 0.22), transparent 65%)',
              }}
            />
            {/* Premium grain — kills the flat-blue plane. */}
            <div className="grain pointer-events-none absolute inset-0" />

            <div className="relative px-6 pt-6 pb-5">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
                  €1 AI Find
                </div>
                <span className="inline-flex items-center rounded-full bg-white/12 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/85">
                  Refunded if no match
                </span>
              </div>
              <h2 className="mt-4 text-[24px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[28px] text-balance">
                Your freelancer, matched in 60 seconds.
              </h2>
              <p className="mt-2.5 text-[13px] leading-relaxed text-white/75 max-w-[40ch]">
                Pay <span className="tabular-nums">€1</span> → meet your freelancer in 60 seconds. Refunded if we can't find one.
              </p>
            </div>

            <div className="relative space-y-4 px-6 pb-6">
              {/* Brief recap — one tight line of tags above the CTA. The
                   old heavy card + "Your request" eyebrow lived here;
                   since Step 3 now has one goal, the recap stays to
                   confirm what we heard without stealing focus from the
                   button. Style/audience tags ride along via buildDescription. */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/80">
                <span className="font-semibold uppercase tracking-[0.14em] text-white/50">
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
                  <span key={tag as string} className="inline-block rounded-full bg-white/12 px-2 py-0.5 text-[10.5px] font-medium text-white/85">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Primary CTA — white-on-primary. The trailing arrow
                   reads as forward motion without leaning on a Sparkles
                   icon (the most-overused AI-product tell). The €1 stays
                   tabular-nums so it lines up with the rest of the page. */}
              <button
                data-mascot="hire-submit"
                type="button"
                onClick={handleAiFind}
                disabled={aiFindLoading}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-4 text-[15px] font-semibold text-primary shadow-[0_10px_30px_-10px_rgba(0,0,0,0.3)] transition-all duration-200 ease-out-expo hover:-translate-y-[1px] hover:shadow-[0_14px_36px_-12px_rgba(0,0,0,0.35)] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-90"
              >
                {aiFindLoading ? (
                  <><Loader2 size={16} className="animate-spin text-primary" /> Matching you now…</>
                ) : (
                  <>
                    Match me now — <span className="tabular-nums">€1</span>
                    <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
              <p className="text-center text-[11px] text-white/60">
                Secure checkout via Stripe · no commitment
              </p>
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
            <a href={teamWhatsAppHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15">
              <MessageCircle size={15} /> Chat with us on WhatsApp
            </a>
          </div>
        )}
      </div>

      {/* ── SECONDARY — single-line WhatsApp 24h fallback. The primary
           €1 AI Match is the focus of Step 3; this is just the escape
           hatch for hirers who'd rather wait for a human pick.
           Demoted from a bordered card to a muted button-link so it
           doesn't compete with the hero. Hidden after submit. */}
      {!submitted && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => { void handleVanoSubmit(); }}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline disabled:opacity-60"
          >
            {submitting
              ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
              : <>Prefer to wait? Free match via WhatsApp in 24h →</>}
          </button>
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

        {/* The old "Or pick a package" row with 3 fixed-price packages
             used to live here. Removed on 2026-04-23 to focus the end
             of the hire flow on a single decision: AI Match (€1) or
             the WhatsApp 24h fallback. Having three more pricing CTAs
             after the hero diluted the conversion. */}
      </div>

      {/* Embedded Stripe checkout — opens inline when
           VITE_STRIPE_PUBLISHABLE_KEY is set so hirers never leave
           /hire for the €1 match. Stripe handles payment + 3DS +
           auto-redirect to the return_url on success. Hosted-flow
           fallback still fires when the key is missing or the
           edge function returns no client_secret. */}
      <AiFindCheckoutModal
        open={aiFindCheckoutOpen}
        onClose={() => {
          setAiFindCheckoutOpen(false);
          setAiFindClientSecret(null);
          setAiFindFallbackUrl(null);
        }}
        clientSecret={aiFindClientSecret}
        fallbackUrl={aiFindFallbackUrl}
      />

      {/* Mobile-only sticky CTA for Step 3. The primary €1 button lives
           inside the gradient card (which is great on desktop, where the
           card stays in view) but on mobile a thumb-scroller can blow
           straight past it toward the pricing packages and lose the
           main action. This duplicates the button at the viewport
           bottom so the conversion path stays one tap away no matter
           where they've scrolled. `md:hidden` keeps desktop clean;
           hidden on submitted/loading states so nothing competes for
           attention after they've acted. Safe-area padding means the
           iOS home indicator doesn't eat it.

           The page's `pb-24 md:pb-12` reserves 96px of bottom padding
           on mobile already, so the sticky bar doesn't occlude the
           last real content. */}
      {step === 3 && !submitted && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/92 backdrop-blur-md md:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto max-w-2xl px-4 py-3">
            <button
              type="button"
              onClick={handleAiFind}
              disabled={aiFindLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-[0_6px_20px_-6px_hsl(var(--primary)/0.5)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
            >
              {aiFindLoading ? (
                <><Loader2 size={15} className="animate-spin" /> Matching you now…</>
              ) : (
                <><Sparkles size={15} className="text-amber-200" /> Match me now — €1</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HirePage;
