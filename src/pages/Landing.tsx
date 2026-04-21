import React, { useRef, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { breadcrumbSchema } from '@/lib/structuredData';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { tryFinishGoogleOAuthRedirect } from '@/lib/finishGoogleOAuthRedirect';
import { tryFinishMagicLinkRedirect } from '@/lib/magicLink';
import { setGoogleOAuthIntent, clearGoogleOAuthIntent, hasGoogleOAuthPending } from '@/lib/googleOAuth';
import { getAuthRedirectUrl } from '@/lib/siteUrl';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowRight,
  Clock,
  Shield,
  MapPin,
  MessageSquare,
  Megaphone,
  Linkedin,
  Instagram,
  CircleUser,
  Monitor,
  Video,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import logo from '@/assets/logo.png';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';
import { InteractiveButton } from '@/components/InteractiveButton';
import { isInAppBrowser } from '@/lib/inAppBrowser';
import { track } from '@/lib/track';
import { LiveMatchesCounter } from '@/components/LiveMatchesCounter';
import { cn } from '@/lib/utils';
import { prefetchHandlers } from '@/lib/prefetchRoute';


const Landing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const oauthHandledRef = useRef(false);

  /**
   * "Join as a freelancer" fires Google OAuth directly with an intent of
   * 'student' — no detour through /auth. After return, tryFinishGoogleOAuthRedirect
   * routes a freshly-created student straight to /profile.
   */
  const handleFreelancerSignup = async () => {
    // Short-circuit if the user is in an embedded in-app browser (Fiverr,
    // Instagram, TikTok, etc). Google blocks OAuth there with a 403
    // "disallowed_useragent" page — routing them to their real browser first
    // is the only way through. InAppBrowserBanner at the top of the page
    // carries the "Open in Safari/Chrome" action.
    if (isInAppBrowser()) {
      track('in_app_browser_blocked', { source: 'landing_freelancer_signup' });
      toast({
        title: "Can't sign in here",
        description: "Open this page in Safari or Chrome first — see the banner at the top.",
        variant: 'destructive',
      });
      return;
    }
    setGoogleOAuthIntent('student');
    // Breadcrumb before the page redirects to Google. Without this the
    // hero card just vanishes and a first-timer wonders if they broke
    // something. The HirePage hirer flow already has an equivalent
    // "Saving your brief…" toast; this is the freelancer-side parity.
    toast({
      title: 'Taking you to Google…',
      description: "Sign in with Google and we'll bring you right back to finish setup.",
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
      clearGoogleOAuthIntent();
      toast({ title: 'Sign-in failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const [session, setSession] = React.useState<Session | null | undefined>(undefined);
  const [featuredStudents, setFeaturedStudents] = React.useState<any[]>([]);
  const [studentsLoaded, setStudentsLoaded] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);

  const catKeywords: Record<string, string[]> = {
    websites: ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify'],
    videography: ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo'],
    digital_sales: ['sales', 'sdr', 'bdr', 'cold call', 'cold email', 'outbound', 'lead gen', 'lead generation', 'prospect', 'closing', 'b2b', 'saas sales'],
    social_media: ['social', 'marketing', 'content', 'instagram', 'tiktok', 'facebook', 'twitter', 'media', 'canva', 'strategy'],
  };

  const filteredStudents = React.useMemo(() => {
    if (!activeCategory) return featuredStudents;
    const kws = catKeywords[activeCategory] || [];
    return featuredStudents.filter((s) =>
      (s.skills as string[]).some((sk) => kws.some((kw) => sk.toLowerCase().includes(kw)))
    );
  }, [featuredStudents, activeCategory]);

  const dayIndex = Math.floor(Date.now() / 86400000);
  const featured = filteredStudents.length > 0 ? filteredStudents[dayIndex % filteredStudents.length] : null;
  const stripStudents = filteredStudents.filter((s) => s.user_id !== featured?.user_id);

  // Use only onAuthStateChange (fires INITIAL_SESSION with the real stored session).
  // Calling getSession() separately can resolve null before localStorage is read,
  // causing a logged-out flash for users who are already signed in.
  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    const fetchFeatured = async () => {
      const { data: sprofs } = await supabase
        .from('student_profiles')
        .select('user_id, skills, is_available, bio, hourly_rate, typical_budget_min, typical_budget_max, created_at')
        .eq('is_available', true)
        .eq('community_board_status', 'approved')
        .not('skills', 'eq', '{}')
        .limit(20);
      if (!sprofs?.length) { setStudentsLoaded(true); return; }
      const uids = sprofs.map((s: any) => s.user_id);
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', uids);
      const profMap: Record<string, any> = {};
      (profs || []).forEach((p: any) => { profMap[p.user_id] = p; });
      const combined = sprofs
        .map((sp: any) => ({
          user_id: sp.user_id,
          display_name: profMap[sp.user_id]?.display_name || null,
          avatar_url: profMap[sp.user_id]?.avatar_url || null,
          top_skill: (sp.skills || [])[0] || null,
          skills: sp.skills || [],
          bio: sp.bio || null,
          hourly_rate: sp.hourly_rate || null,
          typical_budget_min: sp.typical_budget_min || null,
          typical_budget_max: sp.typical_budget_max || null,
          created_at: sp.created_at || null,
        }))
        .filter((s: any) => s.display_name && !s.display_name.toUpperCase().startsWith('VANO'));
      setFeaturedStudents(combined);
      setStudentsLoaded(true);
    };
    fetchFeatured();
  }, []);

  /** Google OAuth returns to site root (`redirectTo`); finish profile + route once session is ready.
   *  We run once on mount AND on every auth-state change — the `INITIAL_SESSION` event fires
   *  as soon as Supabase has restored the session, which covers the race we used to paper over
   *  with a 400ms setTimeout. Keep it simple: two calls, no timers. */
  React.useEffect(() => {
    const finish = async () => {
      if (oauthHandledRef.current) return;
      // Capture the "was coming back from OAuth" state BEFORE
      // tryFinishGoogleOAuthRedirect clears the flag. Used below to
      // post a welcome toast when the handoff succeeded — pairs with
      // the "Taking you to Google…" toast we fire pre-OAuth so the
      // round-trip has both a going-out and a coming-back breadcrumb.
      const wasReturningFromOAuth = hasGoogleOAuthPending();
      const doneGoogle = await tryFinishGoogleOAuthRedirect(navigate);
      if (doneGoogle) {
        oauthHandledRef.current = true;
        if (wasReturningFromOAuth) {
          toast({
            title: 'Welcome to Vano',
            description: "Signed in. Taking you to the next step.",
          });
        }
        return;
      }
      const doneMagic = await tryFinishMagicLinkRedirect(navigate);
      if (doneMagic) oauthHandledRef.current = true;
    };
    void finish();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void finish();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [navigate, toast]);

  const mainRef = useRef<HTMLDivElement>(null);

  // Decorative scroll-driven motion (GSAP timelines, parallax, cursor glow,
  // number counter, text reveal) was removed to keep the landing page calm and
  // focused. The structural layout is unchanged.

  // Brief splash when returning from Google OAuth — prevents the hero from
  // flashing for 100–300ms on mobile while Supabase restores the session
  // and tryFinishGoogleOAuthRedirect navigates the user to their destination.
  const [returningFromOAuth] = React.useState(
    () => (typeof window !== 'undefined' && hasGoogleOAuthPending()),
  );

  if (returningFromOAuth) {
    // OAuth-return placeholder. Previous copy ("One sec…") + a
    // full-screen spinner killed momentum right at the moment we've
    // successfully signed the user in. This skeleton mirrors the
    // rough shape of the hero (logo chip, title block, two action
    // cards) so the transition into the real app feels continuous.
    // Slow pulse + a quiet caption keeps the intent obvious without
    // reading as "something is broken / still loading".
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col items-center justify-center gap-5 px-6 py-10">
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="" className="h-12 w-12 rounded-xl shadow-sm" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Signing you in
            </p>
          </div>
          <div
            className="flex w-full flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-6 shadow-sm"
            aria-busy
            aria-label="Finishing sign-in"
          >
            <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
            <div className="h-3.5 w-5/6 animate-pulse rounded bg-muted/80" />
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted/80" />
            <div className="mt-3 grid w-full grid-cols-2 gap-2">
              <div className="h-10 animate-pulse rounded-xl bg-muted" />
              <div className="h-10 animate-pulse rounded-xl bg-muted/70" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Bringing you to the right place…</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={mainRef} className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title="Hand-picked freelancers, paid safely"
        description="€1 finds your freelancer in 60 seconds. Chat, agree a rate, then pay safely through Vano Pay. Freelancers: list yourself free — videography, content, web design, digital sales."
        keywords="hire freelancer, freelance marketplace, videographer, digital sales, web design, content creation, ugc, gig work, ireland, galway, vano pay"
        jsonLd={breadcrumbSchema([{ name: 'Home', path: '/' }])}
      />
      <Navbar />

      {/* Hero */}
      <section data-hero-section className="relative min-h-[70dvh] flex flex-col justify-center px-4 md:px-8 lg:px-12 pt-20 pb-4 overflow-hidden">
        {/* Breathing gradient orb */}
        <div data-hero-orb className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] sm:w-[500px] sm:h-[500px] md:w-[700px] md:h-[700px] rounded-full bg-gradient-to-br from-primary/[0.07] via-transparent to-emerald-500/[0.05] blur-2xl sm:blur-3xl" />

        <div data-hero-content className="relative max-w-3xl mx-auto text-center" style={{ perspective: '800px' }}>
          {/* Vano Match eyebrow — "hand-picked for you" sells the
              bespoke promise without naming the price. */}
          <div data-hero-eyebrow className="mb-5 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-3 w-3" />
              Hand-picked for you · in 60 seconds
            </span>
          </div>

          {/* Display type — semibold (not bold), tighter tracking at
              lg, two short declarative lines. The italic second line
              is the emotional landing ("your perfect match") that
              frames everything below. */}
          <div data-hero-title>
            <h1 className="mb-5 text-[40px] font-semibold leading-[0.98] tracking-tight text-foreground text-balance sm:mb-6 sm:text-[56px] md:text-[72px] lg:text-[92px] lg:tracking-[-0.035em]">
              <span className="inline-block">Any brief. Any budget.</span><br />
              <span className="inline-block italic font-semibold text-primary">
                Your perfect match.
              </span>
            </h1>
          </div>
          <p data-hero-sub className="mx-auto mb-8 max-w-[46ch] text-[15px] font-normal leading-relaxed text-muted-foreground text-balance sm:text-base lg:text-[17px]">
            Share your brief. We hand-pick two matches in 60 seconds — one from Vano, one scouted from the open web. You chat, agree a rate, then pay them safely through Vano Pay.
          </p>

          {/* Two path cards — the streamlined core of the hero. One
              door for hirers (Vano Match), one for freelancers (list
              in 30s). Balanced visual weight so both audiences see
              themselves. Pricing stays off the landing page and is
              introduced later inside the hire flow. Replaces the old
              button row + redundant tag cloud (which duplicated the
              category cards below). */}
          <div
            data-hero-paths
            className={cn(
              'mx-auto grid max-w-2xl gap-3 text-left sm:gap-4',
              !session ? 'sm:grid-cols-2' : 'sm:grid-cols-1',
            )}
          >
            {/* HIRER PATH — Vano Match. Primary gradient surface,
                 mirrors the HirePage match card. €1 chip is visible
                 because opacity-ambiguity about the price was the one
                 place the old Landing was dishonest — €1 finds the
                 match, then the hirer pays the freelancer directly
                 through Vano Pay. Two-pill preview strip inside the
                 card shows what the €1 produces so the click isn't a
                 leap of faith. */}
            <InteractiveButton
              burstType="sparkle"
              particleCount={25}
              magneticStrength={0.35}
              onClick={() => navigate('/hire')}
              {...prefetchHandlers('hire')}
              className="group relative w-full overflow-hidden rounded-[20px] border border-primary/30 bg-gradient-to-b from-primary to-primary/90 p-5 text-white shadow-[0_18px_44px_-22px_hsl(var(--primary)/0.55)] transition-all duration-200 hover:-translate-y-[2px] hover:shadow-[0_22px_50px_-22px_hsl(var(--primary)/0.6)] active:translate-y-0 active:scale-[0.99]"
            >
              <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-amber-300/20 blur-3xl" />
              <div className="relative flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                    <Sparkles size={12} className="text-amber-200" /> I want to hire
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.18] px-2.5 py-0.5 text-[10.5px] font-bold text-white ring-1 ring-white/20">
                    €1 · 60s
                  </span>
                </div>
                <p className="mt-3 text-[19px] font-semibold leading-[1.15] tracking-tight sm:text-[20px]">
                  Find my freelancer
                </p>
                <p className="mt-1.5 text-[12.5px] leading-snug text-white/80">
                  €1 finds two matches. Chat, agree a rate, then pay safely via Vano Pay.
                </p>
                {/* Preview of the €1 deliverable — two pills showing
                     "Vano pick" + "Web scout" so the hirer sees what
                     they get before clicking. Both pills render the
                     same shape so they read as peer options. */}
                <div className="mt-4 grid grid-cols-2 gap-1.5">
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-2.5 py-1.5 ring-1 ring-white/15">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/20">
                      <Sparkles size={10} className="text-amber-200" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/60">Vano pick</p>
                      <p className="truncate text-[11px] font-semibold text-white">From the pool</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.1] px-2.5 py-1.5 ring-1 ring-white/15">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/20">
                      <Shield size={10} className="text-emerald-200" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/60">Web scout</p>
                      <p className="truncate text-[11px] font-semibold text-white">Found for you</p>
                    </div>
                  </div>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
                  Start a Vano Match
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </InteractiveButton>

            {/* FREELANCER PATH — Free to list. Soft card surface, same
                 20px radius + same hover translate so the two doors feel
                 equal even though primary fills the hirer card. */}
            {!session ? (
              <InteractiveButton
                data-mascot="freelancer-cta"
                burstType="sparkle"
                particleCount={15}
                magneticStrength={0.25}
                onClick={handleFreelancerSignup}
                {...prefetchHandlers('auth')}
                className="group relative w-full overflow-hidden rounded-[20px] border border-border/70 bg-card p-5 shadow-[0_12px_30px_-18px_rgba(0,0,0,0.25)] transition-all duration-200 hover:-translate-y-[2px] hover:border-foreground/15 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.28)] active:translate-y-0 active:scale-[0.99]"
              >
                <div className="pointer-events-none absolute -right-10 -top-20 h-40 w-40 rounded-full bg-emerald-500/15 blur-3xl" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 motion-safe:animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                      I want to work
                    </span>
                    <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Free
                    </span>
                  </div>
                  <p className="mt-3 text-[19px] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-[20px]">
                    Get found. Get paid.
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">
                    List yourself in 30 seconds. Paid safely through Vano Pay.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                    Join as a freelancer
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </InteractiveButton>
            ) : null}
          </div>
            {studentsLoaded && featuredStudents.length > 0 && (
              <div data-hero-badge className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 mt-6">
                <span className="inline-flex items-center gap-2">
                  {/* Slow-pulsing live-dot: movement + emerald = "real time, fresh inventory" */}
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <p className="text-xs font-medium text-muted-foreground">
                    {featuredStudents.length} freelancers online now
                  </p>
                </span>
                {/* Social-proof counter. Self-gating: renders null until the
                    RPC returns ≥3 so the platform doesn't advertise itself
                    as dead when the table's empty. */}
                <LiveMatchesCounter />
              </div>
            )}
        </div>
      </section>


      {/* What do you need? */}
      <section data-section-categories className="py-14 md:py-20 px-4 md:px-8 lg:px-12">
        <div className="max-w-5xl lg:max-w-6xl mx-auto">
          <div>
          <span className="inline-block rounded-full bg-foreground/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground mb-4">What do you need?</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Videography', sub: 'Filming, reels & promos', icon: Video, cat: 'videography', image: '/cat-videography.png' as string | null },
              { label: 'Digital Sales', sub: 'Outbound, lead gen & closing', icon: TrendingUp, cat: 'digital_sales', image: '/cat-digital_sales.png' as string | null },
              { label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor, cat: 'websites', image: '/cat-websites.png' as string | null },
              { label: 'Content Creation', sub: 'UGC & social media management', icon: Megaphone, cat: 'social_media', image: '/cat-social_media.png' as string | null },
            ].map((item) => {
              // Image paths derived from the naming convention used in /public.
              // .webp at 400w (mobile) / 800w (desktop+retina), PNG as fallback.
              const slug = item.cat;
              return (
                <button
                  data-cat-card
                  key={slug}
                  type="button"
                  onClick={() => { navigate(`/hire?category=${slug}`); }}
                  className="group relative overflow-hidden flex flex-col items-start gap-3 rounded-2xl border border-foreground/10 bg-card p-4 md:p-5 lg:p-6 text-left shadow-sm transition-all duration-250 active:scale-[0.97] hover:border-foreground/20 hover:shadow-lg hover:-translate-y-[2px]"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  {item.image ? (
                    <picture className="absolute inset-0 h-full w-full pointer-events-none">
                      <source
                        type="image/webp"
                        srcSet={`/cat-${slug}-400.webp 400w, /cat-${slug}-800.webp 800w`}
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                      <img
                        data-cat-img
                        src={item.image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        width="400"
                        height="600"
                        className="absolute inset-0 h-full w-full object-cover opacity-40 pointer-events-none select-none transition-all duration-500 group-hover:opacity-50 group-hover:scale-105"
                      />
                    </picture>
                  ) : (
                    // Fallback backdrop when there's no dedicated hero image
                    // (e.g. digital_sales). Warm neutral gradient + category
                    // icon avoids the blank-white card look.
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-primary/10 to-emerald-500/20 pointer-events-none" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent pointer-events-none" />
                  <div className="relative z-10 flex flex-col gap-3 md:gap-4">
                    <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm transition-all duration-200 group-hover:bg-white/25">
                      <item.icon size={18} className="transition-colors duration-200 text-white group-hover:text-white md:hidden" strokeWidth={2} />
                      <item.icon size={22} className="transition-colors duration-200 text-white group-hover:text-white hidden md:block" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-[13px] md:text-[15px] font-bold text-white leading-snug drop-shadow-sm">{item.label}</p>
                      <p className="text-[11px] md:text-[13px] text-white/80 mt-0.5 leading-snug">{item.sub}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        </div>
      </section>
      {(studentsLoaded ? featuredStudents.length > 0 : true) && (
        <section data-section-freelancers className="py-8 md:py-12 overflow-hidden">
          <div
            className="max-w-5xl lg:max-w-6xl mx-auto px-4 md:px-8 lg:px-12"
          >
            <div data-section-label className="flex items-end justify-between mb-4">
              <div>
                <span className="inline-block rounded-full bg-foreground/[0.05] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">On VANO now</span>
                <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">Freelancers available today</h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/students')}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 pb-0.5"
              >
                See all <ArrowRight size={14} />
              </button>
            </div>

            {/* Featured freelancer of the day — full-width hero card */}
            {!studentsLoaded && (
              <div className="mb-4 flex gap-4 rounded-2xl border border-foreground/10 bg-card p-4 animate-pulse">
                <div className="h-20 w-20 shrink-0 rounded-xl bg-muted" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 w-1/3 rounded bg-muted" />
                  <div className="h-3.5 w-1/2 rounded bg-muted" />
                  <div className="h-3 w-3/4 rounded bg-muted" />
                </div>
              </div>
            )}
            {studentsLoaded && featured && (
              <button
                type="button"
                onClick={() => navigate(`/students/${featured.user_id}`)}
                data-featured-card
                className="mb-4 w-full flex items-center gap-4 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm text-left transition-all hover:border-foreground/20 hover:shadow-md active:scale-[0.99]"
              >
                {/* Avatar */}
                <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-muted">
                  {featured.avatar_url ? (
                    <img src={featured.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-foreground/20">
                      {(featured.display_name || 'F')[0].toUpperCase()}
                    </div>
                  )}
                  <span className="absolute right-1.5 bottom-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-primary">Featured today</span>
                  <p className="text-[14px] font-semibold text-foreground truncate mt-0.5">{featured.display_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {featured.top_skill && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary truncate">
                        {featured.top_skill}
                      </span>
                    )}
                    {featured.hourly_rate > 0 && (
                      <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">€{featured.hourly_rate}/hr</span>
                    )}
                  </div>
                  {featured.bio && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground truncate">
                      {featured.bio.trim().split(' ').slice(0, 5).join(' ')}
                      <span className="pointer-events-none select-none blur-[3px]"> {featured.bio.trim().split(' ').slice(5, 9).join(' ')}</span>
                    </p>
                  )}
                </div>
                <ArrowRight size={16} className="shrink-0 text-muted-foreground" />
              </button>
            )}

            {/* Scroll strip — compact text snippets (name, rate/budget, bio preview); tap → full profile */}
            {(studentsLoaded ? stripStudents.length > 0 : true) && (
              <div className="relative">
              <div data-freelancer-strip className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {!studentsLoaded
                  ? [1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="flex w-48 sm:w-56 md:w-64 shrink-0 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3 md:p-4 animate-pulse"
                      >
                        <div className="flex gap-2.5">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                          <div className="flex-1 space-y-1.5 pt-0.5">
                            <div className="h-3 w-24 rounded bg-muted" />
                            <div className="h-2.5 w-16 rounded bg-muted" />
                          </div>
                        </div>
                        <div className="h-2 w-full rounded bg-muted" />
                        <div className="h-2 w-5/6 rounded bg-muted" />
                        <div className="h-2 w-4/6 rounded bg-muted" />
                        <div className="mt-1 flex gap-1">
                          <div className="h-5 w-14 rounded-md bg-muted" />
                          <div className="h-5 w-12 rounded-md bg-muted" />
                        </div>
                      </div>
                    ))
                  : stripStudents.map((s) => {
                      const isNew =
                        s.created_at &&
                        Date.now() - new Date(s.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;
                      const budgetLabel = formatTypicalBudget(s.typical_budget_min, s.typical_budget_max);
                      const skillPills = ((s.skills as string[]) || []).slice(0, 2);
                      const hourly = typeof s.hourly_rate === 'number' ? s.hourly_rate : 0;
                      return (
                        <button
                          key={s.user_id}
                          type="button"
                          onClick={() => navigate(`/students/${s.user_id}`)}
                          className="group flex w-48 sm:w-56 md:w-64 shrink-0 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3 md:p-4 text-left shadow-sm transition-all hover:border-foreground/20 hover:shadow-md active:scale-[0.98]"
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                              {s.avatar_url ? (
                                <img
                                  src={s.avatar_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-foreground/30">
                                  {(s.display_name || 'F')[0].toUpperCase()}
                                </div>
                              )}
                              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border-2 border-card bg-emerald-500" />
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                                  {s.display_name}
                                </p>
                                {isNew && (
                                  <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-primary-foreground">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            {hourly > 0 && (
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                €{hourly}/hr
                              </span>
                            )}
                            {budgetLabel && (
                              <span className="font-medium text-muted-foreground">{budgetLabel} projects</span>
                            )}
                          </div>
                          {s.bio?.trim() && (
                            <p className="line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                              {s.bio.trim()}
                            </p>
                          )}
                          {skillPills.length > 0 && (
                            <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
                              {skillPills.map((sk) => (
                                <span
                                  key={sk}
                                  className="max-w-full truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary"
                                >
                                  {sk}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                {studentsLoaded && featuredStudents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/students')}
                    className="flex w-48 sm:w-56 md:w-64 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-muted/20 p-4 transition-all hover:border-foreground/30 hover:bg-muted/40 min-h-[9.5rem]"
                  >
                    <ArrowRight size={22} className="text-muted-foreground" />
                    <p className="text-center text-[12px] font-semibold text-muted-foreground">
                      See all on Talent
                    </p>
                  </button>
                )}
              </div>
              </div>
            )}
            {studentsLoaded && filteredStudents.length === 0 && activeCategory && (
              <p className="text-base text-muted-foreground text-center py-4">No freelancers available for this category right now.</p>
            )}
          </div>
        </section>
      )}

      {/* Why VANO */}
      <section data-section-why className="py-20 md:py-32 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl lg:max-w-5xl mx-auto">
          <div className="text-center">
            <span className="inline-block rounded-full bg-primary/[0.08] px-3 py-1 text-[10px] font-medium text-primary uppercase tracking-[0.2em] mb-4">Why VANO</span>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-center mb-5 tracking-tight leading-[1.1] text-balance">Built different, on purpose</h2>
            <p className="text-center text-muted-foreground mb-14 max-w-lg lg:max-w-xl mx-auto text-base leading-relaxed">Not another global marketplace. VANO is designed for local communities — starting with Galway.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-5">
            {/* Hyperlocal — 2 cols row 1 */}
            <div
              data-why-card
              className="col-span-2 sm:col-span-2 group relative overflow-hidden rounded-2xl border border-blue-500/[0.08] bg-blue-500/[0.02] dark:bg-blue-500/[0.04] p-7 sm:p-8 lg:p-10 transition-transform duration-200 hover:scale-[1.02] hover:-translate-y-1"
            >
              <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-blue-500/[0.06] blur-2xl transition-all duration-500 group-hover:h-56 group-hover:w-56 group-hover:bg-blue-500/[0.12]" />
              <div>
                <div data-why-icon className="mb-5 flex h-12 w-12 lg:h-14 lg:w-14 items-center justify-center rounded-xl bg-blue-500/10 transition-colors group-hover:bg-blue-500/20">
                  <MapPin size={22} className="text-blue-600 dark:text-blue-400" strokeWidth={2} />
                </div>
                <h3 className="text-xl lg:text-2xl font-semibold text-foreground mb-2">Hyperlocal, by design</h3>
                <p className="text-base text-muted-foreground leading-relaxed max-w-sm lg:max-w-md">Built for Galway first — every gig shows location, and you can always filter for work nearby or remote.</p>
              </div>
            </div>

            {/* Speed — 1 col row 1 */}
            <div
              data-why-card
              className="col-span-1 group relative overflow-hidden rounded-2xl border border-emerald-500/[0.08] bg-card p-5 lg:p-7 transition-transform duration-200 hover:scale-[1.02] hover:-translate-y-1"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-emerald-500/[0.06] blur-2xl transition-all duration-500 group-hover:h-40 group-hover:w-40 group-hover:bg-emerald-500/[0.12]" />
              <div>
                <div data-why-icon className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/20">
                  <Clock size={18} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                </div>
                <h3 className="text-sm lg:text-base font-semibold text-foreground mb-1">Hire in minutes</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Describe what you need, get matched, pick someone — done.</p>
              </div>
            </div>

            {/* Chat — 1 col row 2 */}
            <div
              data-why-card
              className="col-span-1 group relative overflow-hidden rounded-2xl border border-violet-500/[0.08] bg-card p-5 lg:p-7 transition-transform duration-200 hover:scale-[1.02] hover:-translate-y-1"
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-violet-500/[0.06] blur-2xl transition-all duration-500 group-hover:h-40 group-hover:w-40 group-hover:bg-violet-500/[0.12]" />
              <div>
                <div data-why-icon className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 transition-colors group-hover:bg-violet-500/20">
                  <MessageSquare size={18} className="text-violet-600 dark:text-violet-400" strokeWidth={2} />
                </div>
                <h3 className="text-sm lg:text-base font-semibold text-foreground mb-1">Chat on platform</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Keep briefs and updates in VANO — no juggling apps.</p>
              </div>
            </div>

            {/* Trust — 2 cols row 2 */}
            <div
              data-why-card
              className="col-span-2 sm:col-span-2 group relative overflow-hidden rounded-2xl border border-amber-500/[0.08] bg-amber-500/[0.02] dark:bg-amber-500/[0.04] p-6 lg:p-8 flex items-center gap-5 transition-transform duration-200 hover:scale-[1.02] hover:-translate-y-1"
            >
              <div className="pointer-events-none absolute -left-8 -bottom-8 h-40 w-40 rounded-full bg-amber-500/[0.06] blur-2xl transition-all duration-500 group-hover:h-56 group-hover:w-56 group-hover:bg-amber-500/[0.12]" />
              <div className="flex items-center gap-5">
                <div data-why-icon className="flex h-12 w-12 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 transition-colors group-hover:bg-amber-500/20">
                  <Shield size={22} className="text-amber-600 dark:text-amber-400" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-base lg:text-lg font-semibold text-foreground mb-0.5">Built on trust</h3>
                  <p className="text-base text-muted-foreground leading-relaxed">Profiles with portfolios, reviews, and verified gigs — so you know who you're dealing with before you hire.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section data-section-faq className="py-20 md:py-28 px-4 md:px-8 lg:px-12">
        <div className="max-w-2xl lg:max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <span className="inline-block rounded-full bg-foreground/[0.05] px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-[0.2em] mb-4">
              FAQ
            </span>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground text-balance">
              Common questions
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              Straight answers about hiring and freelancing on VANO.
            </p>
          </div>
          <div data-faq-body>
            <Accordion type="single" collapsible className="w-full rounded-2xl border border-border bg-card px-2 py-1 shadow-sm">
              <AccordionItem value="what" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  What is VANO?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  A marketplace for hand-picked freelancers. Tell us what you need — for €1 we match you with one freelancer from our pool and one scouted from the open web. You chat, agree a rate, then pay them safely through Vano Pay.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="hire" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  How do I hire someone?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  Start a Vano Match — tell us the category, timeline, and budget, and for €1 we hand-pick two freelancers in 60 seconds. You then message them, agree a rate, and pay through Vano Pay when you're ready. Prefer to browse? Pick a category on the talent board and message anyone directly — no match fee.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="pay" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  How does payment work?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  Pay through Vano Pay and your money is held on Vano until you release it — so the freelancer has to deliver first. If nothing happens in 14 days it auto-releases. If the work doesn't land you can flag a problem and get a full refund. Vano takes 3%.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="galway" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  Is VANO only for Galway?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  Galway is our home base — it's where the density is highest. Freelancers and clients anywhere are welcome, and each match shows location so you can filter for local, nationwide, or remote.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="freelancer" className="border-border/80 px-2 border-b-0">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  I am a freelancer — how do I start?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  Sign up, publish a short listing in 30 seconds, then turn on Vano Pay so clients can tap a button to pay you safely. Money lands in your bank 1–2 days after release. Vano takes 3%; there's no monthly fee.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section data-section-cta className="py-20 md:py-32 px-4 md:px-8 lg:px-12">
        <div className="max-w-2xl lg:max-w-3xl mx-auto">
          <div data-cta-box className="relative overflow-hidden rounded-3xl bg-primary px-5 py-10 sm:px-10 sm:py-14 lg:px-20 lg:py-20 text-center">
            {/* Floating magic orbs */}
            <div data-cta-orb className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full bg-white/[0.08] blur-3xl" />
            <div data-cta-orb className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-white/[0.06] blur-3xl" />
            <span className="relative inline-block rounded-full bg-white/[0.1] px-3 py-1 mb-5 text-[10px] lg:text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">Hand-picked · Safely paid · Galway-built</span>
            <h2 className="relative text-[30px] font-semibold text-primary-foreground tracking-tight leading-[1.05] mb-4 text-balance sm:text-[44px] lg:text-[56px] lg:tracking-[-0.03em]">
              Your perfect match,<br />
              <span className="italic font-semibold text-primary-foreground/95">hand-picked.</span>
            </h2>
            <p className="relative text-primary-foreground/70 mb-10 text-base lg:text-[17px] max-w-[44ch] mx-auto leading-relaxed text-balance">
              €1 finds your match in 60 seconds. You chat, agree a rate, then pay them safely through Vano Pay.
            </p>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3">
              <InteractiveButton
                burstType="confetti"
                particleCount={35}
                magneticStrength={0.4}
                onClick={() => navigate('/hire')}
                className="group w-full sm:w-auto inline-flex items-center gap-2.5 px-7 py-3.5 bg-primary-foreground text-primary rounded-full font-bold text-base shadow-lg shadow-black/10 transition-all duration-200 hover:bg-primary-foreground/90 hover:shadow-xl hover:-translate-y-[1px] active:scale-[0.97]"
              >
                Find my freelancer — €1
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight size={14} />
                </span>
              </InteractiveButton>
              <InteractiveButton
                burstType="sparkle"
                particleCount={15}
                magneticStrength={0.3}
                onClick={handleFreelancerSignup}
                className="w-full sm:w-auto px-7 py-3.5 border border-primary-foreground/25 text-primary-foreground rounded-full font-medium text-sm transition-all duration-200 hover:bg-primary-foreground/10 hover:-translate-y-[1px] active:scale-[0.97]"
              >
                Join as a freelancer
              </InteractiveButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer data-section-footer className="border-t border-foreground/6 py-20 md:py-28 px-4 md:px-8 lg:px-12">
        <div className="max-w-5xl lg:max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-10 lg:gap-16 mb-10">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <img src={logo} alt="VANO" className="h-8 w-8 rounded-lg" loading="lazy" decoding="async" />
                <span className="text-xl font-bold text-foreground">VANO</span>
              </div>
              <p className="text-base text-muted-foreground max-w-xs lg:max-w-sm leading-relaxed">
                Connecting businesses with trusted freelancers, anywhere. Fast and simple.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Platform</h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  <button onClick={() => navigate('/students')} className="text-left text-foreground/70 hover:text-primary transition-colors">Find talent</button>
                  <button onClick={() => navigate('/hire')} className="text-left text-foreground/70 hover:text-primary transition-colors">Browse hiring</button>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Connect</h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  <a
                    href="https://www.instagram.com/vano.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-foreground/70 hover:text-primary transition-colors"
                  >
                    <Instagram className="h-3.5 w-3.5" strokeWidth={2} />
                    Instagram
                  </a>
                  <a
                    href="https://www.linkedin.com/company/vano-app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-foreground/70 hover:text-primary transition-colors"
                  >
                    <Linkedin className="h-3.5 w-3.5" strokeWidth={2} />
                    LinkedIn
                  </a>
                  <a
                    href="https://www.linkedin.com/in/manoj07ar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-foreground/70 hover:text-primary transition-colors"
                  >
                    <CircleUser className="h-3.5 w-3.5" strokeWidth={2} />
                    Contact
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              © {new Date().getFullYear()} VANO · {APP_VERSION_LABEL}
            </span>
            <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <button type="button" onClick={() => navigate('/privacy')} className="hover:text-primary transition-colors">
                Privacy
              </button>
              <span aria-hidden className="hidden sm:inline">·</span>
              <button type="button" onClick={() => navigate('/terms')} className="hover:text-primary transition-colors">
                Terms
              </button>
              <span aria-hidden className="hidden sm:inline">·</span>
              <button type="button" onClick={() => navigate('/blog/vano-v1')} className="hover:text-primary transition-colors">
                Release notes
              </button>
              <span aria-hidden className="hidden sm:inline">·</span>
              <RequestFeatureLink className="text-xs" />
              <span aria-hidden className="hidden sm:inline">·</span>
              <span>Made in Galway, Ireland</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
