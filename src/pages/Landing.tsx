import React, { useRef, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { tryFinishGoogleOAuthRedirect } from '@/lib/finishGoogleOAuthRedirect';
import {
  ArrowRight,
  Clock,
  Shield,
  MapPin,
  MessageSquare,
  Megaphone,
  Linkedin,
  CircleUser,
  Monitor,
  Video,
  Camera,
} from 'lucide-react';
import logo from '@/assets/logo.png';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';
import { gsap, ScrollTrigger } from '@/lib/gsapSetup';


const Landing = () => {
  const navigate = useNavigate();
  const oauthHandledRef = useRef(false);
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);
  const [featuredStudents, setFeaturedStudents] = React.useState<any[]>([]);
  const [studentsLoaded, setStudentsLoaded] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);

  const catKeywords: Record<string, string[]> = {
    websites: ['web', 'website', 'wordpress', 'html', 'css', 'developer', 'coding', 'design', 'frontend', 'shopify'],
    videography: ['video', 'film', 'filming', 'videography', 'reel', 'drone', 'premiere', 'davinci', 'motion', 'promo'],
    photography: ['photo', 'photography', 'photographer', 'portrait', 'headshot', 'lightroom', 'product photo', 'brand photo'],
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
        .not('bio', 'is', null)
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

  /** Google OAuth returns to site root (`redirectTo`); finish profile + route once session is ready. */
  React.useEffect(() => {
    const finish = async () => {
      if (oauthHandledRef.current) return;
      const done = await tryFinishGoogleOAuthRedirect(navigate);
      if (done) oauthHandledRef.current = true;
    };
    void finish();
    const t = window.setTimeout(() => void finish(), 400);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void finish();
    });
    return () => {
      window.clearTimeout(t);
      subscription.unsubscribe();
    };
  }, [navigate]);

  /* ─── GSAP cinematic scroll animations ─── */
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      /* ── Hero: storybook opens — words cascade with 3D depth ── */
      const heroTl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      heroTl
        .fromTo('[data-hero-title] > *',
          { y: isMobile ? 40 : 80, opacity: 0, rotateX: isMobile ? 6 : 20, transformPerspective: isMobile ? 0 : 600 },
          { y: 0, opacity: 1, rotateX: 0, stagger: isMobile ? 0.1 : 0.15, duration: isMobile ? 0.8 : 1.2, delay: 0.15 }
        )
        .fromTo('[data-hero-sub]',
          { y: 40, opacity: 0, filter: 'blur(4px)' },
          { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8 },
          '-=0.6'
        )
        .fromTo('[data-hero-cta] > *',
          { y: 30, opacity: 0, scale: 0.8 },
          { y: 0, opacity: 1, scale: 1, stagger: 0.12, duration: 0.8, ease: 'elastic.out(1, 0.5)' },
          '-=0.4'
        )
        .fromTo('[data-hero-badge]',
          { scale: 0, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(3)' },
          '-=0.2'
        );

      /* ── Hero orb: living breathing pulse with drift ── */
      gsap.to('[data-hero-orb]', {
        scale: 1.2,
        opacity: 0.8,
        rotation: 15,
        duration: 5,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });

      /* ── Category cards: flip in like playing cards dealt onto a table ── */
      gsap.fromTo('[data-cat-card]',
        { y: isMobile ? 50 : 100, opacity: 0, scale: isMobile ? 0.9 : 0.8, rotateY: isMobile ? 8 : 25, rotateX: isMobile ? 0 : 8, transformPerspective: isMobile ? 0 : 800 },
        {
          y: 0, opacity: 1, scale: 1, rotateY: 0, rotateX: 0,
          scrollTrigger: { trigger: '[data-section-categories]', start: 'top 85%', toggleActions: 'play none none none' },
          stagger: isMobile ? 0.1 : 0.15, duration: isMobile ? 0.6 : 0.9, ease: 'back.out(1.4)',
        }
      );

      /* ── Category card images: deep parallax drift ── */
      document.querySelectorAll<HTMLElement>('[data-cat-card]').forEach((card) => {
        const img = card.querySelector<HTMLElement>('[data-cat-img]');
        if (!img) return;
        gsap.to(img, {
          scrollTrigger: {
            trigger: card,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
          },
          y: -40,
          scale: 1.12,
          ease: 'none',
        });
      });

      /* ── Freelancers: characters float onto the scene ── */
      const freelancerTl = gsap.timeline({
        scrollTrigger: {
          trigger: '[data-section-freelancers]',
          start: 'top 75%',
          toggleActions: 'play none none none',
        },
      });
      freelancerTl
        .fromTo('[data-section-freelancers] [data-section-label]',
          { x: -60, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }
        )
        .fromTo('[data-featured-card]',
          { y: 50, opacity: 0, scale: 0.9, rotation: -1 },
          { y: 0, opacity: 1, scale: 1, rotation: 0, duration: 0.9, ease: 'elastic.out(1, 0.6)' },
          '-=0.3'
        )
        .fromTo('[data-freelancer-strip] > *',
          { x: 100, opacity: 0, rotation: 3 },
          { x: 0, opacity: 1, rotation: 0, stagger: 0.1, duration: 0.6, ease: 'power3.out' },
          '-=0.4'
        );

      /* ── Why VANO: chapters unfold with 3D tilt ── */
      gsap.fromTo('[data-why-card]',
        { y: isMobile ? 40 : 80, opacity: 0, scale: isMobile ? 0.92 : 0.85, rotateX: isMobile ? 0 : 15, transformPerspective: isMobile ? 0 : 800 },
        {
          y: 0, opacity: 1, scale: 1, rotateX: 0,
          scrollTrigger: { trigger: '[data-section-why]', start: 'top 85%', toggleActions: 'play none none none' },
          stagger: isMobile ? 0.08 : 0.12, duration: isMobile ? 0.6 : 0.8, ease: 'back.out(1.5)',
        }
      );

      /* ── Why icons: dramatic half-spin entrance ── */
      document.querySelectorAll<HTMLElement>('[data-why-icon]').forEach((icon) => {
        gsap.fromTo(icon,
          { scale: 0, rotation: -180 },
          {
            scale: 1, rotation: 0,
            scrollTrigger: { trigger: icon, start: 'top 90%', toggleActions: 'play none none none' },
            duration: 0.7, ease: 'back.out(3)',
          }
        );
      });

      /* ── FAQ: scroll unfurls with depth ── */
      gsap.fromTo('[data-section-faq] [data-faq-body]',
        { y: 60, opacity: 0, scale: 0.95, rotateX: 5, transformPerspective: 800 },
        {
          y: 0, opacity: 1, scale: 1, rotateX: 0,
          scrollTrigger: { trigger: '[data-section-faq]', start: 'top 85%', toggleActions: 'play none none none' },
          duration: 0.9, ease: 'power3.out',
        }
      );

      /* ── CTA: grand finale — dramatic entrance with staggered content ── */
      const ctaTl = gsap.timeline({
        scrollTrigger: {
          trigger: '[data-section-cta]',
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      });
      ctaTl
        .fromTo('[data-cta-box]',
          { y: 100, opacity: 0, scale: 0.75, rotation: -2 },
          { y: 0, opacity: 1, scale: 1, rotation: 0, duration: 1.1, ease: 'power4.out' }
        )
        .fromTo('[data-cta-box] > *',
          { y: 30, opacity: 0 },
          { y: 0, opacity: 1, stagger: 0.08, duration: 0.5, ease: 'power3.out' },
          '-=0.4'
        );

      /* ── CTA orbs: floating magic with opacity pulse ── */
      gsap.utils.toArray<HTMLElement>('[data-cta-orb]').forEach((orb, i) => {
        gsap.to(orb, {
          y: i % 2 === 0 ? -30 : 30,
          x: i % 2 === 0 ? 20 : -15,
          scale: 1.3,
          opacity: 0.6,
          duration: 3.5 + i * 1.5,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });

      /* ── Footer: children stagger in individually ── */
      gsap.fromTo('[data-section-footer] > div > *',
        { y: 40, opacity: 0 },
        {
          y: 0, opacity: 1,
          scrollTrigger: { trigger: '[data-section-footer]', start: 'top 95%', toggleActions: 'play none none none' },
          stagger: 0.08, duration: 0.6, ease: 'power3.out',
      });
    }, mainRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={mainRef} className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title="VANO – Connect Galway Businesses with Students"
        description="We connect Galway businesses with freelancers for local gigs. Simple, fast, local."
        keywords="galway, freelance, gigs, jobs, web design, marketing, odd jobs, local"
      />
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[70dvh] flex flex-col justify-center px-4 md:px-8 lg:px-12 pt-20 pb-4 overflow-hidden">
        {/* Breathing gradient orb */}
        <div data-hero-orb className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] sm:w-[500px] sm:h-[500px] md:w-[700px] md:h-[700px] rounded-full bg-gradient-to-br from-primary/[0.07] via-transparent to-emerald-500/[0.05] blur-2xl sm:blur-3xl" />

        <div className="relative max-w-3xl mx-auto text-center" style={{ perspective: '800px' }}>
          <div data-hero-title>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-bold tracking-tight lg:tracking-tighter text-foreground mb-5 sm:mb-6 leading-[1.05] text-balance">
              <span className="inline-block">Local talent,</span><br />
              <span
                className="inline-block italic font-semibold bg-clip-text text-transparent animate-shimmer"
                style={{
                  backgroundImage: 'linear-gradient(90deg, hsl(var(--foreground)) 0%, hsl(221 83% 53%) 20%, hsl(200 70% 50%) 35%, hsl(var(--foreground)) 50%, hsl(38 80% 55%) 65%, hsl(221 83% 53%) 80%, hsl(var(--foreground)) 100%)',
                  backgroundSize: '300% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                instantly available.
              </span>
            </h1>
          </div>
          <p data-hero-sub className="text-muted-foreground text-base lg:text-lg max-w-lg mx-auto mb-8 leading-relaxed">
            Connect with Galway's best freelancers for videography, photography, web design, and more.
          </p>
          <div data-hero-cta className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/hire')}
                className="group w-full sm:w-auto inline-flex items-center gap-2.5 px-7 py-3.5 rounded-full bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 hover:-translate-y-[1px] active:scale-[0.97]"
              >
                Hire a freelancer
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight size={14} />
                </span>
              </button>
              {!session ? (
                <button
                  type="button"
                  onClick={() => navigate('/auth?mode=signup')}
                  className="w-full sm:w-auto px-7 py-3.5 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/30 hover:text-foreground hover:shadow-md hover:-translate-y-[1px] active:scale-[0.97]"
                >
                  Join as a freelancer
                </button>
              ) : null}
            </div>
            {studentsLoaded && featuredStudents.length > 0 && (
              <div data-hero-badge className="flex items-center justify-center gap-2 mt-6">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse-ring" />
                  <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <p className="text-xs font-medium text-muted-foreground">
                  {featuredStudents.length} freelancers online now
                </p>
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
              { label: 'Videography', sub: 'Filming, reels & promos', icon: Video, cat: 'videography', image: '/cat-videography.png' },
              { label: 'Photography', sub: 'Events, brands & portraits', icon: Camera, cat: 'photography', image: '/cat-photography.png' },
              { label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor, cat: 'websites', image: '/cat-websites.png' },
              { label: 'Social Media', sub: 'Content, strategy & growth', icon: Megaphone, cat: 'social_media', image: '/cat-social_media.png' },
            ].map((item) => (
                <button
                  data-cat-card
                  key={item.cat}
                  type="button"
                  onClick={() => navigate(`/hire?category=${item.cat}`)}
                  className="group relative overflow-hidden flex flex-col items-start gap-3 rounded-2xl border border-foreground/10 bg-card p-4 md:p-5 lg:p-6 text-left shadow-sm transition-all duration-250 active:scale-[0.97] hover:border-foreground/20 hover:shadow-lg hover:-translate-y-[2px]"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  <img
                    data-cat-img
                    src={item.image}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-40 pointer-events-none select-none transition-all duration-500 group-hover:opacity-50 group-hover:scale-105"
                  />
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
            ))}
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
                  VANO connects businesses with freelancers in Galway. Browse talent, hire for projects, and message in-app — all in one place.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="hire" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  How do I hire someone?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  Create an account, browse freelancers or tell us what you need on the hire page. We'll match you with the right person, or you can message freelancers directly.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="pay" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  How does payment work?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  VANO helps you find each other and communicate. You and the other party agree payment method and timing directly — always confirm details clearly in your thread.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="galway" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  Is VANO only for Galway?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  We are built around Galway first — local gigs and talent are the focus. You can still use remote-friendly setups; each gig shows location where it matters.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="freelancer" className="border-border/80 px-2 border-b-0">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  I am a freelancer — how do I start?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4 max-w-[65ch]">
                  Sign up as a freelancer, complete your profile and portfolio links, then browse open gigs and apply with a short message. Good profiles and reviews help you stand out.
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
            <span className="relative inline-block rounded-full bg-white/[0.1] px-3 py-1 mb-5 text-[10px] lg:text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground/60">Galway · Free · Local</span>
            <h2 className="relative text-3xl sm:text-5xl lg:text-6xl font-bold text-primary-foreground tracking-tight leading-tight mb-4 text-balance">
              Need something done?<br />Tell us.
            </h2>
            <p className="relative text-primary-foreground/60 mb-10 text-base lg:text-lg max-w-sm lg:max-w-md mx-auto leading-relaxed">Quality work at affordable rates. Describe what you need — we'll match you with the right freelancer.</p>
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/hire')}
                className="group w-full sm:w-auto inline-flex items-center gap-2.5 px-7 py-3.5 bg-primary-foreground text-primary rounded-full font-bold text-base shadow-lg shadow-black/10 transition-all duration-200 hover:bg-primary-foreground/90 hover:shadow-xl hover:-translate-y-[1px] active:scale-[0.97]"
              >
                Hire a freelancer
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight size={14} />
                </span>
              </button>
              <button
                onClick={() => navigate('/auth')}
                className="w-full sm:w-auto px-7 py-3.5 border border-primary-foreground/25 text-primary-foreground rounded-full font-medium text-sm transition-all duration-200 hover:bg-primary-foreground/10 hover:-translate-y-[1px] active:scale-[0.97]"
              >
                Join as a freelancer
              </button>
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
                Connecting businesses with freelancers for gigs across Galway. Fast and simple.
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
