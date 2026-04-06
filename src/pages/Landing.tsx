import React, { useRef } from 'react';
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
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { formatTypicalBudget } from '@/lib/freelancerProfile';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';
import { BlurredTalentMarquee } from '@/components/BlurredTalentMarquee';


const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
};

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

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title="VANO – Connect Galway Businesses with Students"
        description="We connect Galway businesses with freelancers for local gigs. Simple, fast, local."
        keywords="galway, freelance, gigs, jobs, web design, marketing, odd jobs, local"
      />
      <Navbar />

      {/* Hero */}
      <section className="relative min-h-[70vh] flex flex-col justify-center px-4 md:px-8 lg:px-12 pt-20 pb-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground mb-5 sm:mb-6 leading-[1.07]"
            >
              Local talent,<br />
              <span className="italic font-semibold">instantly available.</span>
            </motion.h1>
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8"
            >
              <button
                type="button"
                onClick={() => navigate(session ? '/profile' : '/auth?mode=signup')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.97]"
              >
                Become a freelancer
              </button>
              <button
                type="button"
                onClick={() => navigate('/jobs')}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground shadow-sm transition-all hover:border-primary/30 hover:shadow-md active:scale-[0.97]"
              >
                Hire a freelancer
              </button>
              {studentsLoaded && featuredStudents.length > 0 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {featuredStudents.length} freelancers available
                </p>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Freelancer marquee */}
      <div className="px-4 md:px-8 lg:px-12">
        <div className="max-w-5xl lg:max-w-6xl mx-auto">
          <BlurredTalentMarquee />
        </div>
      </div>

      {/* What do you need? */}
      <section className="pt-2 pb-6 px-4 md:px-8 lg:px-12">
        <div className="max-w-5xl lg:max-w-6xl mx-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-3">What do you need?</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            {[
              { label: 'Videography', sub: 'Filming, reels & promos', icon: Video, cat: 'videography', image: '/cat-videography.png' },
              { label: 'Photography', sub: 'Events, brands & portraits', icon: Camera, cat: 'photography', image: '/cat-photography.png' },
              { label: 'Website Design', sub: 'Get a site built or fixed', icon: Monitor, cat: 'websites', image: '/cat-websites.png' },
              { label: 'Social Media', sub: 'Content, strategy & growth', icon: Megaphone, cat: 'social_media', image: '/cat-social_media.png' },
            ].map((item) => (
                <button
                  key={item.cat}
                  type="button"
                  onClick={() => navigate(`/students?cat=${item.cat}`)}
                  className="group relative overflow-hidden flex flex-col items-start gap-3 rounded-2xl border border-foreground/10 bg-card p-4 md:p-5 lg:p-6 text-left shadow-sm transition-all active:scale-[0.98] hover:border-foreground/20 hover:shadow-md"
                >
                  <img
                    src={item.image}
                    alt=""
                    aria-hidden="true"
                    className="absolute inset-0 h-full w-full object-cover opacity-30 pointer-events-none select-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent pointer-events-none" />
                  <div className="relative z-10 flex flex-col gap-3 md:gap-4">
                    <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-xl transition-colors bg-foreground/8 group-hover:bg-primary/10">
                      <item.icon size={18} className="transition-colors text-foreground group-hover:text-primary md:hidden" strokeWidth={2} />
                      <item.icon size={22} className="transition-colors text-foreground group-hover:text-primary hidden md:block" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-[13px] md:text-[15px] font-bold text-foreground leading-snug">{item.label}</p>
                      <p className="text-[11px] md:text-[13px] text-foreground/80 mt-0.5 leading-snug">{item.sub}</p>
                    </div>
                  </div>
                </button>
            ))}
          </div>
        </div>
      </section>

      {/* Freelancer section */}
      {(studentsLoaded ? featuredStudents.length > 0 : true) && (
        <section className="pb-4 md:pb-6 overflow-hidden">
          <div className="max-w-5xl lg:max-w-6xl mx-auto px-4 md:px-8 lg:px-12">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">On VANO now</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">Freelancers available today</h2>
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
              <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {!studentsLoaded
                  ? [1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="flex w-56 md:w-64 shrink-0 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3 md:p-4 animate-pulse"
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
                          className="group flex w-56 md:w-64 shrink-0 flex-col gap-2 rounded-2xl border border-foreground/10 bg-card p-3 md:p-4 text-left shadow-sm transition-all hover:border-foreground/20 hover:shadow-md active:scale-[0.98]"
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
                    className="flex w-56 md:w-64 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 bg-muted/20 p-4 transition-all hover:border-foreground/30 hover:bg-muted/40 min-h-[9.5rem]"
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
              <p className="text-sm text-muted-foreground text-center py-4">No freelancers available for this category right now.</p>
            )}
          </div>
        </section>
      )}

      {/* Why VANO */}
      <section className="py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl lg:max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] text-center mb-3">Why VANO</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-4">Built different, on purpose</motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-center text-muted-foreground mb-12 max-w-lg lg:max-w-xl mx-auto lg:text-lg">We're not another global marketplace. VANO is designed for local communities — starting with Galway.</motion.p>
          </motion.div>
          <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={staggerContainer}
          >
            {/* Hyperlocal — 2 cols row 1 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45 }} className="col-span-2 sm:col-span-2 rounded-2xl border border-foreground/10 bg-card p-6 sm:p-7 lg:p-8 transition-all hover:shadow-md hover:border-foreground/20">
              <div className="mb-4 flex h-11 w-11 lg:h-13 lg:w-13 items-center justify-center rounded-xl bg-blue-500/10">
                <MapPin size={20} className="text-blue-600 dark:text-blue-400" strokeWidth={2} />
              </div>
              <h3 className="text-lg lg:text-xl font-semibold text-foreground mb-2">Hyperlocal, by design</h3>
              <p className="text-sm lg:text-base text-muted-foreground leading-relaxed max-w-xs lg:max-w-sm">Built for Galway first — every gig shows location, and you can always filter for work nearby or remote.</p>
            </motion.div>

            {/* Speed — 1 col row 1 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45, delay: 0.06 }} className="col-span-1 rounded-2xl border border-foreground/10 bg-card p-5 lg:p-6 transition-all hover:shadow-md hover:border-foreground/20">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                <Clock size={18} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
              </div>
              <h3 className="text-sm lg:text-base font-semibold text-foreground mb-1">Hire in minutes</h3>
              <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed">Post a gig, get applicants, pick someone — done.</p>
            </motion.div>

            {/* Chat — 1 col row 2 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45, delay: 0.1 }} className="col-span-1 rounded-2xl border border-foreground/10 bg-card p-5 lg:p-6 transition-all hover:shadow-md hover:border-foreground/20">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                <MessageSquare size={18} className="text-violet-600 dark:text-violet-400" strokeWidth={2} />
              </div>
              <h3 className="text-sm lg:text-base font-semibold text-foreground mb-1">Chat on platform</h3>
              <p className="text-xs lg:text-sm text-muted-foreground leading-relaxed">Keep briefs and updates in VANO — no juggling apps.</p>
            </motion.div>

            {/* Trust — 2 cols row 2 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45, delay: 0.14 }} className="col-span-2 sm:col-span-2 rounded-2xl border border-foreground/10 bg-card p-5 lg:p-6 flex items-center gap-5 transition-all hover:shadow-md hover:border-foreground/20">
              <div className="flex h-11 w-11 lg:h-13 lg:w-13 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                <Shield size={20} className="text-amber-600 dark:text-amber-400" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm lg:text-base font-semibold text-foreground mb-0.5">Built on trust</h3>
                <p className="text-sm lg:text-base text-muted-foreground leading-relaxed">Profiles with portfolios, reviews, and verified gigs — so you know who you're dealing with before you hire.</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12 md:py-16 px-4 md:px-8 lg:px-12">
        <div className="max-w-2xl lg:max-w-3xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
            className="text-center mb-6"
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-3">
              FAQ
            </motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              Common questions
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="mt-3 text-sm text-muted-foreground">
              Straight answers about hiring and freelancing on VANO.
            </motion.p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45 }}
          >
            <Accordion type="single" collapsible className="w-full rounded-2xl border border-border bg-card px-2 py-1 shadow-sm">
              <AccordionItem value="what" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  What is VANO?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  VANO connects people hiring for gigs with freelancers in Galway. You can browse talent, post fixed-price work with a deadline, message in-app, and use the community board.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="hire" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  How do I hire someone?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  Create an account, browse freelancers or post a gig with budget and due date. Applicants reach out; you agree scope in messages, then complete the work off-platform or as you arrange.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="pay" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  How does payment work?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  VANO helps you find each other and communicate. You and the other party agree payment method and timing directly — always confirm details clearly in your thread.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="galway" className="border-border/80 px-2">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  Is VANO only for Galway?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  We are built around Galway first — local gigs and talent are the focus. You can still use remote-friendly setups; each gig shows location where it matters.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="freelancer" className="border-border/80 px-2 border-b-0">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline py-4">
                  I am a freelancer — how do I start?
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  Sign up as a freelancer, complete your profile and portfolio links, then browse open gigs and apply with a short message. Good profiles and reviews help you stand out.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <motion.div
          className="max-w-2xl lg:max-w-3xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={scaleIn}
          transition={{ duration: 0.55 }}
        >
          <div className="rounded-3xl bg-primary px-8 py-12 sm:px-14 sm:py-16 lg:px-20 lg:py-20 text-center">
            <p className="mb-4 text-[11px] lg:text-xs font-medium uppercase tracking-[0.15em] text-primary-foreground/50">Galway · Free · Local</p>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-primary-foreground tracking-tight leading-tight mb-4">
              Your next gig<br />starts here.
            </h2>
            <p className="text-primary-foreground/60 mb-10 text-sm sm:text-base lg:text-lg max-w-sm lg:max-w-md mx-auto leading-relaxed">Join freelancers and local businesses in Galway — free to join, takes less than a minute.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/auth')}
                className="w-full sm:w-auto px-8 py-3.5 bg-primary-foreground text-primary rounded-xl font-semibold text-sm hover:bg-primary-foreground/90 transition-colors"
              >
                Get started — it&apos;s free
              </button>
              <button
                onClick={() => navigate('/students')}
                className="w-full sm:w-auto px-8 py-3.5 border border-primary-foreground/25 text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-foreground/10 transition-colors"
              >
                Browse talent
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <motion.footer
        className="border-t border-border py-12 px-4 md:px-8 lg:px-12"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-5xl lg:max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 lg:gap-12 mb-8">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <img src={logo} alt="VANO" className="h-7 w-7 rounded-lg" loading="lazy" decoding="async" />
                <span className="text-lg font-bold text-foreground">VANO</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs lg:max-w-sm leading-relaxed">
                Connecting businesses with freelancers for gigs across Galway. Fast and simple.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Platform</h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  <button onClick={() => navigate('/students')} className="text-left text-foreground/70 hover:text-primary transition-colors">Find talent</button>
                  <button onClick={() => navigate('/jobs')} className="text-left text-foreground/70 hover:text-primary transition-colors">Browse hiring</button>
                  <button onClick={() => navigate('/community')} className="text-left text-foreground/70 hover:text-primary transition-colors">Community</button>
                  <button onClick={() => navigate('/post-job')} className="text-left text-foreground/70 hover:text-primary transition-colors">Post a gig</button>
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
              <button type="button" onClick={() => navigate('/whats-new')} className="hover:text-primary transition-colors">
                Release notes
              </button>
              <span aria-hidden className="hidden sm:inline">·</span>
              <RequestFeatureLink className="text-xs" />
              <span aria-hidden className="hidden sm:inline">·</span>
              <span>Made in Galway, Ireland</span>
            </span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default Landing;
