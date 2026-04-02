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
  Clock,
  Shield,
  MapPin,
  Users,
  Search,
  MessageSquare,
  Video,
  Camera,
  Monitor,
  Megaphone,
} from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { APP_VERSION_LABEL } from '@/lib/appVersion';
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

  // Use only onAuthStateChange (fires INITIAL_SESSION with the real stored session).
  // Calling getSession() separately can resolve null before localStorage is read,
  // causing a logged-out flash for users who are already signed in.
  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });
    return () => subscription.unsubscribe();
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
      <section className="relative pt-28 sm:pt-32 md:pt-44 pb-16 md:pb-28 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_13rem] gap-10 md:gap-16 items-start">
            {/* Text column */}
            <motion.div
              className="text-center md:text-left"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              <motion.h1
                variants={fadeUp}
                transition={{ duration: 0.55, delay: 0.05 }}
                className="text-[2.75rem] sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-[-0.02em] text-foreground mb-5 sm:mb-6 leading-[1.05]"
              >
                Hire a Galway<br />
                <span className="italic font-bold text-primary">student this week.</span>
              </motion.h1>
              <motion.p
                variants={fadeUp}
                transition={{ duration: 0.55, delay: 0.15 }}
                className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto md:mx-0 mb-8 leading-relaxed"
              >
                Real portfolios. Real rates. Message directly — no middlemen.
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
                  { value: '€0', label: 'Free' },
                  { value: 'Galway', label: 'Only' },
                  { value: '60 sec', label: 'Post' },
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
                  </>
                ) : (
                  <div className="flex w-full max-w-xl flex-col items-center md:items-start gap-3 mx-auto md:mx-0">
                    <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center md:justify-start sm:flex-wrap">
                      <button type="button" onClick={() => navigate('/auth?mode=signup')} className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                        Get started — it's free<ArrowRight size={16} />
                      </button>
                      <button type="button" onClick={() => navigate('/auth?mode=signup')} className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 hover:bg-muted/40 transition-all flex items-center justify-center gap-2">
                        <Briefcase size={16} />Post a gig in 60 sec
                      </button>
                    </div>
                    <p className="text-center md:text-left text-xs text-muted-foreground leading-relaxed">
                      Already have an account?{' '}
                      <button type="button" onClick={() => navigate('/auth?mode=login')} className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                        Log in
                      </button>
                    </p>
                  </div>
                )}
              </motion.div>

              <BlurredTalentMarquee />
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
                { value: 'Galway', label: 'Galway only' },
                { value: '60 sec', label: 'To post a gig' },
              ].map((s) => (
                <div key={s.value} className="rounded-2xl border border-foreground/10 bg-card px-5 py-4 shadow-sm">
                  <p className="text-2xl font-bold tracking-tight text-foreground">{s.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </motion.div>
          </div>

        </div>
      </section>

      {/* How it works */}
      <section className="py-5 px-4 md:px-8 border-y border-border/60">
        <div className="max-w-5xl mx-auto">
          <ol className="flex flex-col sm:flex-row items-start sm:items-center justify-center gap-4 sm:gap-0 text-sm">
            {[
              { n: '1', label: 'Sign up free', note: 'Google login · 30 seconds' },
              { n: '2', label: 'Post or browse', note: 'Gigs or talent directly' },
              { n: '3', label: 'Message & hire', note: 'Agree scope, get it done' },
            ].map((item, i) => (
              <React.Fragment key={item.n}>
                <li className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">{item.n}</span>
                  <span>
                    <span className="font-semibold text-foreground">{item.label}</span>
                    <span className="ml-1.5 text-muted-foreground">{item.note}</span>
                  </span>
                </li>
                {i < 2 && <span className="hidden sm:block mx-5 text-border text-lg select-none">→</span>}
              </React.Fragment>
            ))}
          </ol>
        </div>
      </section>

      {/* What do you need? — white/blue brand tiles */}
      <section className="pt-10 pb-8 px-4 md:px-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-4">What do you need?</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                cat: 'videography',
                label: 'Videography',
                desc: 'Filming, reels & promo videos.',
                keywords: 'REELS · PROMO · WEDDINGS',
                pills: ['Reels', 'Events', 'Drone'],
                Icon: Video,
              },
              {
                cat: 'photography',
                label: 'Photography',
                desc: 'Events, brands & portraits.',
                keywords: 'EVENTS · BRANDS · PORTRAITS',
                pills: ['Weddings', 'Products', 'Headshots'],
                Icon: Camera,
              },
              {
                cat: 'websites',
                label: 'Website Design',
                desc: 'Build, design & launch your site.',
                keywords: 'SHOPIFY · WORDPRESS · REACT',
                pills: ['Landing page', 'Shopify', 'UI/UX'],
                Icon: Monitor,
              },
              {
                cat: 'social_media',
                label: 'Social Media',
                desc: 'Content, strategy & growth.',
                keywords: 'INSTAGRAM · TIKTOK · CONTENT',
                pills: ['Strategy', 'Reels', 'Ads'],
                Icon: Megaphone,
              },
            ].map((tile) => (
              <button
                key={tile.cat}
                type="button"
                onClick={() => navigate(`/students?cat=${tile.cat}`)}
                className="group relative h-48 sm:h-56 md:h-64 overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md hover:scale-[1.01] active:scale-[0.99]"
              >
                {/* Large decorative icon — top-right watermark */}
                <tile.Icon
                  className="absolute -right-4 -top-4 text-primary/8 transition-transform duration-500 group-hover:scale-110 group-hover:text-primary/12"
                  size={120}
                  strokeWidth={1.25}
                />
                <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
                  {/* Keywords */}
                  <p className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {tile.keywords}
                  </p>
                  {/* Bottom content */}
                  <div>
                    {/* Small icon badge */}
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                      <tile.Icon size={20} className="text-primary" strokeWidth={2} />
                    </div>
                    <h3 className="text-lg sm:text-xl md:text-2xl font-extrabold leading-tight tracking-tight text-foreground">
                      {tile.label}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-[11px] sm:text-xs text-muted-foreground">{tile.desc}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="hidden sm:flex flex-wrap gap-1.5">
                        {tile.pills.map((pill) => (
                          <span key={pill} className="rounded-full bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium text-primary">
                            {pill}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] sm:text-[12px] font-semibold text-primary shrink-0 group-hover:underline underline-offset-2">
                        Explore →
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>


      {/* Why VANO */}
      <section className="py-20 md:py-32 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.12em] text-center mb-3">Why VANO</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl font-bold text-center mb-4">Why businesses use VANO</motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-center text-muted-foreground mb-12 max-w-lg mx-auto">Not a global marketplace — just Galway talent you can actually trust and meet in person.</motion.p>
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
      <section className="py-20 md:py-32 px-4 md:px-8 bg-muted/30">
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
          <div className="rounded-3xl bg-primary px-8 py-12 sm:px-14 sm:py-16 text-center">
            <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.15em] text-primary-foreground/50">Galway · Free · Local</p>
            <h2 className="text-3xl sm:text-5xl font-bold text-primary-foreground tracking-tight leading-tight mb-4">
              Your next gig<br />starts here.
            </h2>
            <p className="text-primary-foreground/60 mb-10 text-sm sm:text-base max-w-sm mx-auto leading-relaxed">Join freelancers and local businesses in Galway — free to join, takes less than a minute.</p>
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
