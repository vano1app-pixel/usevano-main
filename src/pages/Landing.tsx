import React, { useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { tryFinishGoogleOAuthRedirect } from '@/lib/finishGoogleOAuthRedirect';
import {
  Briefcase,
  ArrowRight,
  Check,
  Clock,
  Shield,
  MapPin,
  Users,
  Search,
  MessageCircle,
  MessageSquare,
  Megaphone,
  Linkedin,
  CircleUser,
  Monitor,
  Video,
} from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
import { RequestFeatureLink } from '@/components/RequestFeatureLink';

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
  const howRef = React.useRef<HTMLElement>(null);
  const oauthHandledRef = useRef(false);
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);
  const [featuredStudents, setFeaturedStudents] = React.useState<any[]>([]);
  const [studentsLoaded, setStudentsLoaded] = React.useState(false);

  const scrollToHow = () => {
    howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    const fetchFeatured = async () => {
      const { data: sprofs } = await supabase
        .from('student_profiles')
        .select('user_id, skills, is_available')
        .eq('is_available', true)
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
      <section className="relative pt-24 sm:pt-20 md:pt-32 pb-14 md:pb-24 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_13rem] gap-10 md:gap-16 items-start">
            {/* Text column */}
            <motion.div
              className="text-center md:text-left"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="flex flex-col items-center md:items-start gap-2.5 mb-6 sm:mb-8">
                <button
                  type="button"
                  onClick={() => navigate('/whats-new')}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-muted border border-border text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
                >
                  <Megaphone size={14} className="text-primary shrink-0" strokeWidth={2} />
                  What&apos;s new in {APP_VERSION_LABEL}
                  <ArrowRight size={12} className="opacity-70" />
                </button>
              </motion.div>
              <motion.h1
                variants={fadeUp}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-[2.6rem] sm:text-5xl md:text-6xl lg:text-[4.25rem] font-bold tracking-tight text-foreground mb-5 sm:mb-6 leading-[1.07]"
              >
                Local talent,<br />
                <span className="italic font-semibold">instantly available.</span>
              </motion.h1>
              <motion.p
                variants={fadeUp}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto md:mx-0 mb-8 leading-relaxed"
              >
                Fixed-price gigs, portfolios, and chat — all in one place. Built for Galway.
              </motion.p>

              {/* Search bar */}
              <motion.div variants={fadeUp} transition={{ duration: 0.5, delay: 0.22 }} className="w-full max-w-xl mx-auto md:mx-0 mb-6">
                <button
                  type="button"
                  onClick={() => navigate('/students')}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-all hover:border-primary/25 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Search size={18} strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Find talent</p>
                    <p className="truncate text-sm font-medium text-foreground">Search freelancers by skill, name, or bio…</p>
                  </div>
                  <ArrowRight size={18} className="shrink-0 text-muted-foreground" />
                </button>
              </motion.div>

              {/* Stat chips — mobile only */}
              <motion.div variants={fadeUp} transition={{ duration: 0.5, delay: 0.25 }} className="flex gap-2 mb-6 md:hidden">
                {[
                  { value: '€0', label: 'Free to join' },
                  { value: 'Galway', label: 'Hyper-local' },
                  { value: '1 min', label: 'Post a gig' },
                ].map((s) => (
                  <div key={s.value} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-foreground/10 bg-card px-3 py-1.5 shadow-sm">
                    <p className="text-sm font-bold text-foreground">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </motion.div>

              <motion.div
                variants={fadeUp}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row sm:flex-wrap items-center md:items-start justify-center md:justify-start gap-3 min-h-[3.25rem]"
              >
                {session === undefined ? (
                  <div className="flex w-full max-w-md justify-center gap-3 sm:max-w-none">
                    <div className="h-12 w-full max-w-[200px] animate-pulse rounded-xl bg-muted sm:w-44" />
                    <div className="h-12 w-full max-w-[200px] animate-pulse rounded-xl bg-muted sm:w-44" />
                  </div>
                ) : session ? (
                  <>
                    <button type="button" onClick={() => navigate('/post-job')} className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                      <Briefcase size={18} />Post a gig<ArrowRight size={16} />
                    </button>
                    <button type="button" onClick={() => navigate('/students')} className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 hover:bg-muted/40 transition-all flex items-center justify-center gap-2">
                      <Users size={18} />Browse talent
                    </button>
                    <button type="button" onClick={scrollToHow} className="w-full sm:w-auto px-6 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      How it works
                    </button>
                  </>
                ) : (
                  <div className="flex w-full max-w-xl flex-col items-center md:items-start gap-3 mx-auto md:mx-0">
                    <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center md:justify-start sm:flex-wrap">
                      <button type="button" onClick={() => navigate('/auth?mode=signup')} className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                        Get started — it's free<ArrowRight size={16} />
                      </button>
                      <button type="button" onClick={() => navigate('/post-job')} className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 hover:bg-muted/40 transition-all flex items-center justify-center gap-2">
                        <Briefcase size={16} />Post a gig in 60 sec
                      </button>
                    </div>
                    <button type="button" onClick={scrollToHow} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      How it works ↓
                    </button>
                    <p className="text-center md:text-left text-xs text-muted-foreground leading-relaxed">
                      Already have an account?{' '}
                      <button type="button" onClick={() => navigate('/auth?mode=login')} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                        Log in
                      </button>
                    </p>
                  </div>
                )}
              </motion.div>
            </motion.div>

            {/* Right column — stat cards, desktop only */}
            <motion.div
              className="hidden md:flex flex-col gap-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {[
                { value: '€0', label: 'Free to sign up' },
                { value: 'Galway', label: 'Hyper-local focus' },
                { value: '1 min', label: 'To post a gig' },
              ].map((s) => (
                <div key={s.value} className="rounded-2xl border border-foreground/10 bg-card px-5 py-4 shadow-sm">
                  <p className="text-2xl font-bold tracking-tight text-foreground">{s.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-10 text-center text-sm text-muted-foreground leading-relaxed"
          >
            Fixed-price gigs · In-app messaging · Portfolios &amp; reviews · Community board · Built for Galway
          </motion.p>
        </div>
      </section>

      {/* What do you need? */}
      <section className="pb-6 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-3">What do you need?</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Web & Apps', sub: 'Websites, e-commerce', icon: Monitor, cat: 'websites' },
              { label: 'Video & Photo', sub: 'Filming, editing', icon: Video, cat: 'videographer' },
              { label: 'Social Media', sub: 'Content, campaigns', icon: Megaphone, cat: 'social_media' },
            ].map((item) => (
              <button
                key={item.cat}
                type="button"
                onClick={() => navigate(`/community?cat=${item.cat}`)}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-foreground/10 bg-card p-4 text-left shadow-sm transition-all hover:border-foreground/20 hover:shadow-md active:scale-[0.98]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/8 transition-colors group-hover:bg-primary/10">
                  <item.icon size={18} className="text-foreground group-hover:text-primary transition-colors" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground leading-snug">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{item.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Freelancer strip */}
      {(studentsLoaded ? featuredStudents.length > 0 : true) && (
        <section className="pb-4 md:pb-6 overflow-hidden">
          <div className="max-w-5xl mx-auto px-4 md:px-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">On VANO now</p>
                <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">Freelancers available today</h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/community')}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 pb-0.5"
              >
                See all <ArrowRight size={14} />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {!studentsLoaded
                ? [1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="flex w-[9rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card animate-pulse">
                      <div className="h-[7rem] w-full bg-muted" />
                      <div className="space-y-1.5 px-2.5 py-2.5">
                        <div className="h-3 w-3/4 rounded-md bg-muted" />
                        <div className="h-2.5 w-1/2 rounded-md bg-muted" />
                      </div>
                    </div>
                  ))
                : featuredStudents.map((s) => (
                    <button
                      key={s.user_id}
                      type="button"
                      onClick={() => navigate('/community')}
                      className="group relative flex w-[9rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm transition-all hover:border-foreground/20 hover:shadow-md active:scale-[0.97]"
                    >
                      <div className="relative h-[7rem] w-full overflow-hidden bg-muted">
                        {s.avatar_url ? (
                          <img src={s.avatar_url} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]" loading="lazy" decoding="async" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-foreground/20">
                            {(s.display_name || 'F')[0].toUpperCase()}
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/30 to-transparent" />
                        <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 shadow-sm" />
                      </div>
                      <div className="px-2.5 py-2.5">
                        <p className="truncate text-[12px] font-semibold leading-snug text-foreground">{s.display_name}</p>
                        {s.top_skill && (
                          <p className="pointer-events-none mt-0.5 truncate text-[11px] text-muted-foreground blur-[3px] select-none">{s.top_skill}</p>
                        )}
                      </div>
                    </button>
                  ))}
              {studentsLoaded && featuredStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/community')}
                  className="flex w-[9rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-dashed border-foreground/15 transition-all hover:border-foreground/30 hover:bg-muted/30"
                >
                  <div className="flex h-[7rem] w-full items-center justify-center bg-muted/30">
                    <ArrowRight size={20} className="text-muted-foreground" />
                  </div>
                  <div className="px-2.5 py-2.5">
                    <p className="text-[12px] font-medium text-muted-foreground">See all talent</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* How it works — 4-phase journey */}
      <section ref={howRef} id="how-it-works" className="scroll-mt-24 bg-muted/30 py-16 md:py-24 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
            className="text-center mb-10 md:mb-14"
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-3">
              How it works
            </motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight mb-4">
              From first browse to final delivery
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Discovery, clear scope on each gig, messaging, and reviews — designed for real freelance projects in Galway.
            </motion.p>
          </motion.div>
          <motion.div
            className="max-w-2xl mx-auto"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={staggerContainer}
          >
            {[
              { num: '01', icon: Users, title: 'Find the right fit', desc: 'Browse freelancers by skill, bio, or portfolio. Filter by availability and category.' },
              { num: '02', icon: Briefcase, title: 'Post or apply', desc: 'Post a gig with a fixed budget and due date, or apply to one with a short message.' },
              { num: '03', icon: MessageCircle, title: 'Chat on VANO', desc: 'Align on scope and deliverables in one thread — no scattering details across apps.' },
              { num: '04', icon: Check, title: 'Complete & review', desc: 'Finish the work and build your reputation with completed gigs on your profile.' },
            ].map((step, i, arr) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={{ duration: 0.4, delay: i * 0.09 }}
                className="relative flex gap-5 pb-0"
              >
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-foreground/15 bg-card text-[13px] font-bold text-foreground/60">
                    {step.num}
                  </div>
                  {i < arr.length - 1 && <div className="my-1 w-px flex-1 bg-border" style={{ minHeight: '2.5rem' }} />}
                </div>
                <div className={i < arr.length - 1 ? 'pb-8 pt-1.5' : 'pt-1.5'}>
                  <h3 className="text-base font-semibold text-foreground mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why VANO */}
      <section className="py-16 md:py-24 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] text-center mb-3">Why VANO</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl font-bold text-center mb-4">Built different, on purpose</motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-center text-muted-foreground mb-12 max-w-lg mx-auto">We're not another global marketplace. VANO is designed for local communities — starting with Galway.</motion.p>
          </motion.div>
          <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={staggerContainer}
          >
            {/* Hyperlocal — 2 cols row 1 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45 }} className="col-span-2 sm:col-span-2 rounded-2xl border border-foreground/10 bg-card p-6 sm:p-7">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/8">
                <MapPin size={20} className="text-foreground" strokeWidth={2} />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Hyperlocal, by design</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">Built for Galway first — every gig shows location, and you can always filter for work nearby or remote.</p>
            </motion.div>

            {/* Speed — 1 col row 1 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45, delay: 0.06 }} className="col-span-1 rounded-2xl border border-foreground/10 bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/8">
                <Clock size={18} className="text-foreground" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Hire in minutes</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Post a gig, get applicants, pick someone — done.</p>
            </motion.div>

            {/* Chat — 1 col row 2 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45, delay: 0.1 }} className="col-span-1 rounded-2xl border border-foreground/10 bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/8">
                <MessageSquare size={18} className="text-foreground" strokeWidth={2} />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-1">Chat on platform</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">Keep briefs and updates in VANO — no juggling apps.</p>
            </motion.div>

            {/* Trust — 2 cols row 2 */}
            <motion.div variants={fadeUp} transition={{ duration: 0.45, delay: 0.14 }} className="col-span-2 sm:col-span-2 rounded-2xl border border-foreground/10 bg-card p-5 flex items-center gap-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/8">
                <Shield size={20} className="text-foreground" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-0.5">Built on trust</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">Profiles with portfolios, reviews, and verified gigs — so you know who you're dealing with before you hire.</p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-24 px-4 md:px-8 bg-muted/25">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
            className="text-center mb-10"
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] mb-3">
              FAQ
            </motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
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
      <section className="py-16 md:py-24 px-4 md:px-8">
        <motion.div
          className="max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={scaleIn}
          transition={{ duration: 0.55 }}
        >
          <div className="rounded-3xl bg-foreground px-8 py-12 sm:px-14 sm:py-16 text-center">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.15em] text-background/40">Galway · Free · Local</p>
            <h2 className="text-3xl sm:text-5xl font-bold text-background tracking-tight leading-tight mb-4">
              Your next gig<br />starts here.
            </h2>
            <p className="text-background/55 mb-10 text-sm sm:text-base max-w-sm mx-auto leading-relaxed">Join freelancers and businesses already using VANO across Galway.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/auth')}
                className="w-full sm:w-auto px-8 py-3.5 bg-background text-foreground rounded-xl font-semibold text-sm hover:bg-background/90 transition-colors"
              >
                Get started — it&apos;s free
              </button>
              <button
                onClick={() => navigate('/students')}
                className="w-full sm:w-auto px-8 py-3.5 border border-background/20 text-background rounded-xl font-medium text-sm hover:bg-background/8 transition-colors"
              >
                Browse talent
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <motion.footer
        className="border-t border-border py-12 px-4 md:px-8"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-8">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <img src={logo} alt="VANO" className="h-7 w-7 rounded-lg" loading="lazy" decoding="async" />
                <span className="text-lg font-bold text-foreground">VANO</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                Connecting businesses with freelancers for gigs across Galway. Fast and simple.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Platform</h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  <button onClick={() => navigate('/students')} className="text-left text-foreground/70 hover:text-primary transition-colors">Find talent</button>
                  <button onClick={() => navigate('/jobs')} className="text-left text-foreground/70 hover:text-primary transition-colors">Browse gigs</button>
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
              <button type="button" onClick={() => navigate('/whats-new')} className="hover:text-primary transition-colors">
                Release notes
              </button>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
              <RequestFeatureLink className="text-xs" />
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
              <span>Made in Galway, Ireland</span>
            </span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default Landing;
