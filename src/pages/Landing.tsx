import React from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
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
} from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);

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

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <SEOHead
        title="VANO – Connect Galway Businesses with Students"
        description="We connect Galway businesses with freelancers for local gigs. Simple, fast, local."
        keywords="galway, freelance, gigs, jobs, web design, marketing, odd jobs, local"
      />
      <Navbar />

      {/* Hero */}
      <section className="relative pt-24 sm:pt-16 md:pt-28 pb-14 sm:pb-18 md:pb-24 px-4 md:px-8">
        <motion.div
          className="max-w-3xl mx-auto text-center"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-3 mb-6 sm:mb-8">
            <button
              type="button"
              onClick={() => navigate('/blog/vano-v1')}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-muted border border-border text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            >
              <Megaphone size={14} className="text-primary shrink-0" strokeWidth={2} />
              What&apos;s new in v1.0
              <ArrowRight size={12} className="opacity-70" />
            </button>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border border-border text-muted-foreground text-[11px] font-medium">
              <MapPin size={11} /> Made for Galway · Local gigs
            </span>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-[4.5rem] font-bold tracking-tight text-foreground mb-5 sm:mb-6 leading-[1.08]"
          >
            Local talent,<br />
            <span className="text-primary">instantly matched.</span>
          </motion.h1>
          <motion.p
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto mb-6 sm:mb-8 leading-relaxed"
          >
            Find the right freelancer for your project — browse portfolios, post a gig with budget and deadline, and chat in one place. Start with what you need.
          </motion.p>

          {/* Category-style search entry */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.5, delay: 0.22 }}
            className="w-full max-w-xl mx-auto mb-6"
          >
            <button
              type="button"
              onClick={() => navigate('/students')}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-left shadow-sm transition-all hover:border-primary/25 hover:shadow-md"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Search size={18} strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Find talent</p>
                <p className="truncate text-sm font-medium text-foreground">Search freelancers by skill, name, or bio…</p>
              </div>
              <ArrowRight size={18} className="shrink-0 text-muted-foreground" />
            </button>
          </motion.div>

          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-3 min-h-[3.25rem]"
          >
            {session === undefined ? (
              <div className="flex w-full max-w-md justify-center gap-3 sm:max-w-none">
                <div className="h-12 w-full max-w-[200px] animate-pulse rounded-xl bg-muted sm:w-44" />
                <div className="h-12 w-full max-w-[200px] animate-pulse rounded-xl bg-muted sm:w-44" />
              </div>
            ) : session ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/students')}
                  className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  <Users size={18} />
                  Find talent
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/post-job')}
                  className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 hover:bg-muted/40 transition-all flex items-center justify-center gap-2"
                >
                  <Briefcase size={18} />
                  Post a gig
                </button>
                <button
                  type="button"
                  onClick={scrollToHow}
                  className="w-full sm:w-auto px-6 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  How it works
                </button>
              </>
            ) : (
              <div className="flex w-full max-w-xl flex-col items-center gap-3 mx-auto">
                <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => navigate('/auth?mode=signup')}
                    className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    Get started
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/students')}
                    className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 transition-all flex items-center justify-center gap-2"
                  >
                    <Users size={18} />
                    Find talent
                  </button>
                  <button
                    type="button"
                    onClick={scrollToHow}
                    className="w-full sm:w-auto px-6 py-3.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    How it works
                  </button>
                </div>
                <p className="text-center text-xs text-muted-foreground leading-relaxed">
                  On the next screen you can create an account, or{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/auth?mode=login')}
                    className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    log in if you already have one
                  </button>
                  .
                </p>
              </div>
            )}
          </motion.div>

          <p className="mt-10 text-center text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Fixed-price gigs · In-app messaging · Portfolios &amp; reviews · Community board · Built for Galway
          </p>
        </motion.div>
      </section>

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
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">
              End-to-end workflow
            </motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground tracking-tight mb-4">
              From first browse to final delivery
            </motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
              Discovery, clear scope on each gig, messaging, and reviews — designed for real freelance projects in Galway.
            </motion.p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={staggerContainer}
          >
            {[
              { num: '01', phase: 'Discover', icon: Users, title: 'Find the right fit', desc: 'Browse freelancers, portfolios, and community listings. Search by name, bio, or skills.' },
              { num: '02', phase: 'Scope', icon: Briefcase, title: 'Post or apply', desc: 'Hirers post gigs with budget and due date. Freelancers apply with a message — align on deliverables before you start.' },
              { num: '03', phase: 'Connect', icon: MessageCircle, title: 'Chat on VANO', desc: 'Keep project conversation in one thread. No need to scatter details across different apps.' },
              { num: '04', phase: 'Deliver', icon: Check, title: 'Complete & review', desc: 'Finish the work, then build reputation through reviews and completed gigs on your profile.' },
            ].map((step, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="relative bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm hover:border-primary/20 hover:shadow-md transition-all group text-left"
              >
                <div className="flex items-start justify-between gap-2 mb-4">
                  <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">{step.num}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{step.phase}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                  <step.icon className="text-primary" size={20} strokeWidth={2} />
                </div>
                <h3 className="text-base font-semibold mb-2 text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
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
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs font-medium text-primary uppercase tracking-widest text-center mb-3">Why VANO</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl font-bold text-center mb-4">Built different, on purpose</motion.h2>
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-center text-muted-foreground mb-12 max-w-lg mx-auto">We're not another global marketplace. VANO is designed for local communities — starting with Galway.</motion.p>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={staggerContainer}
          >
            {[
              { icon: Shield, title: 'Trust & reviews', desc: 'Build a reputation with completed gigs, ratings, and a visible portfolio.' },
              { icon: MapPin, title: 'Hyperlocal', desc: 'Find talent and gigs in Galway — location is clear on every gig listing.' },
              { icon: Clock, title: 'Hire in minutes', desc: 'No week-long bidding wars. Post a gig, get applicants, pick someone — done.' },
              { icon: MessageSquare, title: 'Chat on platform', desc: 'Keep briefs and updates in VANO messages instead of juggling apps.' },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="flex gap-4 p-5 rounded-2xl border border-border bg-card hover:border-primary/15 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                  <item.icon size={18} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
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
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">
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
          <div className="bg-primary rounded-2xl p-8 sm:p-12 text-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-primary-foreground mb-3">Ready to get started?</h2>
              <p className="text-primary-foreground/80 mb-8 text-sm sm:text-base">Join freelancers and businesses using VANO in Galway.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate('/auth')}
                  className="w-full sm:w-auto px-8 py-3.5 bg-primary-foreground text-primary rounded-xl font-medium text-sm hover:bg-primary-foreground/90 transition-colors"
                >
                  Create account
                </button>
                <button
                  onClick={() => navigate('/students')}
                  className="w-full sm:w-auto px-8 py-3.5 border border-primary-foreground/25 text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-foreground/10 transition-colors"
                >
                  Find talent
                </button>
              </div>
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
                <img src={logo} alt="VANO" className="h-7 w-7 rounded-lg" />
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
            <span>© {new Date().getFullYear()} VANO. All rights reserved.</span>
            <span>Made in Galway, Ireland</span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default Landing;
