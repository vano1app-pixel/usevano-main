import React from 'react';
import { Navbar } from '@/components/Navbar';
import { useNavigate } from 'react-router-dom';
import { SEOHead } from '@/components/SEOHead';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Briefcase, UserCheck, Zap, ArrowRight, Check, X, Star, Clock, Shield, MapPin, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import logo from '@/assets/logo.png';

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
  const [landingBannerDismissed, setLandingBannerDismissed] = React.useState(false);
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0 relative">
      {/* Subtle noise overlay */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.035]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'repeat',
        backgroundSize: '128px 128px',
      }} />
      <SEOHead
        title="VANO – Connect Galway Businesses with Students"
        description="We connect Galway businesses with freelancers for local gigs. Simple, fast, local."
        keywords="galway, freelance, gigs, jobs, web design, marketing, odd jobs, local"
      />
      <Navbar />

      {/* Hero */}
      <section className="relative pt-24 sm:pt-16 md:pt-28 pb-16 sm:pb-20 md:pb-28 px-4 md:px-8 overflow-hidden">
        {/* Glass decorative shapes */}
        <div className="absolute -top-20 -left-24 w-72 h-72 rounded-full bg-primary/[0.04] border border-primary/[0.06] blur-2xl animate-[float_22s_ease-in-out_infinite]" />
        <div className="absolute top-16 right-[-60px] w-40 h-56 rounded-2xl bg-primary/[0.03] border border-primary/[0.05] rotate-12 blur-xl animate-[float_26s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-8 left-[10%] w-20 h-20 bg-primary/[0.04] border border-primary/[0.06] rotate-45 rounded-lg blur-lg animate-[float_18s_ease-in-out_infinite]" />
        <div className="absolute top-1/2 right-[15%] w-10 h-10 rounded-full bg-primary/[0.05] border border-primary/[0.07] blur-md animate-[float_20s_ease-in-out_infinite_reverse]" />
        <motion.div
          className="max-w-3xl mx-auto text-center relative z-10"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <motion.div variants={fadeUp} transition={{ duration: 0.5 }} className="flex flex-col items-center gap-3 mb-6 sm:mb-8">
            <button
              onClick={() => navigate('/blog/vano-v1')}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors cursor-pointer"
            >
              🎉 VANO v1.0 is here — See what's new <ArrowRight size={12} />
            </button>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 border border-border text-muted-foreground text-[11px] font-medium">
              <MapPin size={11} /> Made for Galway · 100% Free
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
            className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto mb-8 sm:mb-10 leading-relaxed"
          >
            The fastest way to find freelancers and gigs in Galway. Post a job, get matched, done — no fees, no fuss.
          </motion.p>
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 min-h-[3.25rem]"
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
                  className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-all shadow-[0_2px_16px_hsl(var(--primary)/0.25)] hover:shadow-[0_4px_24px_hsl(var(--primary)/0.35)] flex items-center justify-center gap-2"
                >
                  <Users size={18} />
                  Browse freelancers
                  <ArrowRight size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/post-job')}
                  className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 hover:bg-muted/40 transition-all flex items-center justify-center gap-2"
                >
                  <Briefcase size={18} />
                  Post a job
                </button>
              </>
            ) : (
              <div className="flex w-full max-w-xl flex-col items-center gap-3 mx-auto">
                <div className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={() => navigate('/auth?mode=signup')}
                    className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-all shadow-[0_2px_16px_hsl(var(--primary)/0.25)] hover:shadow-[0_4px_24px_hsl(var(--primary)/0.35)] flex items-center justify-center gap-2"
                  >
                    Sign up
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/students')}
                    className="w-full sm:w-auto px-8 py-3.5 bg-card border border-border text-foreground rounded-xl font-medium text-sm hover:border-primary/25 transition-all flex items-center justify-center gap-2"
                  >
                    <Users size={18} />
                    Browse freelancers
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

          {/* Social proof */}
          <motion.div
            variants={fadeUp}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex items-center justify-center gap-6 sm:gap-8 mt-12 sm:mt-16 text-sm text-muted-foreground"
          >
            {[
              { value: '€0', label: 'Platform fees' },
              { value: '<5 min', label: 'Avg. hire time' },
              { value: '100%', label: 'Local talent' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-xl sm:text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-[11px] sm:text-xs mt-0.5">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-24 px-4 md:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={staggerContainer}
          >
            <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs font-medium text-primary uppercase tracking-widest text-center mb-3">How it works</motion.p>
            <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl font-bold text-center mb-12">Three steps, zero hassle</motion.h2>
          </motion.div>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-60px" }}
            variants={staggerContainer}
          >
            {[
              { num: '01', icon: UserCheck, title: 'Sign up', desc: 'Create your profile in seconds. Add skills, set your rate, and go live.' },
              { num: '02', icon: Briefcase, title: 'Post or find gigs', desc: 'Businesses post gigs, freelancers browse and apply — all matched by skills & location.' },
              { num: '03', icon: Zap, title: 'Get it done', desc: 'Connect instantly, agree on scope, and complete the work. Reviews build your reputation.' },
            ].map((step, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-6 hover:border-primary/20 transition-all group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[10px] font-bold text-primary/50 uppercase tracking-widest">{step.num}</span>
                  <div className="h-px flex-1 bg-border" />
                  <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center group-hover:bg-primary/12 transition-colors">
                    <step.icon className="text-primary" size={18} />
                  </div>
                </div>
                <h3 className="text-base font-semibold mb-2">{step.title}</h3>
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
              { icon: Shield, title: 'No fees, ever', desc: 'We don\'t take a cut. Every euro goes directly to the freelancer.' },
              { icon: MapPin, title: 'Hyperlocal', desc: 'Find talent and gigs right in your city. On-site or remote — your call.' },
              { icon: Clock, title: 'Hire in minutes', desc: 'No week-long bidding wars. Post a gig, get applicants, pick someone — done.' },
              { icon: Star, title: 'Reputation matters', desc: 'Verified reviews, photo proof, leaderboards — quality you can trust.' },
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

      {/* VANO vs Fiverr */}
      <section className="py-16 md:py-24 px-4 md:px-8">
        <motion.div
          className="max-w-2xl mx-auto"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerContainer}
        >
          <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-xs font-medium text-primary uppercase tracking-widest text-center mb-3">Comparison</motion.p>
          <motion.h2 variants={fadeUp} transition={{ duration: 0.5 }} className="text-2xl md:text-3xl font-bold text-center mb-3">VANO vs Fiverr</motion.h2>
          <motion.p variants={fadeUp} transition={{ duration: 0.5 }} className="text-center text-muted-foreground mb-10">Built for local gigs, not global bidding wars.</motion.p>
          <motion.div
            variants={scaleIn}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-card border border-border rounded-2xl overflow-hidden"
          >
            <div className="grid grid-cols-[1fr_auto_auto] text-sm">
              <div className="px-5 py-4 border-b border-border" />
              <div className="px-5 py-4 border-b border-border text-center min-w-[80px]">
                <span className="text-primary font-bold">VANO</span>
              </div>
              <div className="px-5 py-4 border-b border-border text-center min-w-[80px]">
                <span className="text-muted-foreground font-medium">Fiverr</span>
              </div>
              {[
                { feature: 'Platform fees', vanoText: '€0', fiverrText: '20% cut' },
                { feature: 'Hiring speed', vanoText: 'Minutes', fiverrText: 'Days' },
                { feature: 'Local & on-site' },
                { feature: 'Physical gigs' },
                { feature: 'Instant start' },
                { feature: 'Community-driven' },
              ].map((row, i) => (
                <React.Fragment key={i}>
                  <div className={`px-5 py-3.5 text-foreground font-medium ${i < 5 ? 'border-b border-border/50' : ''}`}>
                    {row.feature}
                  </div>
                  <div className={`px-5 py-3.5 flex items-center justify-center ${i < 5 ? 'border-b border-border/50' : ''}`}>
                    {row.vanoText ? (
                      <span className="text-xs font-medium text-primary">{row.vanoText}</span>
                    ) : (
                      <Check size={16} className="text-primary" />
                    )}
                  </div>
                  <div className={`px-5 py-3.5 flex items-center justify-center ${i < 5 ? 'border-b border-border/50' : ''}`}>
                    {row.fiverrText ? (
                      <span className="text-xs text-muted-foreground">{row.fiverrText}</span>
                    ) : (
                      <X size={16} className="text-muted-foreground/40" />
                    )}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        </motion.div>
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
          <div className="bg-primary rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'repeat',
              backgroundSize: '128px 128px',
            }} />
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-primary-foreground mb-3">Ready to get started?</h2>
              <p className="text-primary-foreground/70 mb-8 text-sm sm:text-base">Join Galway's growing community of freelancers and businesses.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={() => navigate('/auth')}
                  className="w-full sm:w-auto px-8 py-3.5 bg-primary-foreground text-primary rounded-xl font-medium text-sm hover:bg-primary-foreground/90 transition-colors"
                >
                  Create Free Account
                </button>
                <button
                  onClick={() => navigate('/students')}
                  className="w-full sm:w-auto px-8 py-3.5 border border-primary-foreground/25 text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary-foreground/10 transition-colors"
                >
                  Browse Freelancers
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
                Connecting businesses with freelancers for gigs across Galway. Fast, simple, no fees.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Platform</h4>
                <div className="flex flex-col gap-2.5 text-sm">
                  <button onClick={() => navigate('/students')} className="text-left text-foreground/70 hover:text-primary transition-colors">Browse freelancers</button>
                  <button onClick={() => navigate('/jobs')} className="text-left text-foreground/70 hover:text-primary transition-colors">Browse gigs</button>
                  <button onClick={() => navigate('/post-job')} className="text-left text-foreground/70 hover:text-primary transition-colors">Post a Gig</button>
                  <button onClick={() => navigate('/leaderboard')} className="text-left text-foreground/70 hover:text-primary transition-colors">Leaderboard</button>
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
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    LinkedIn
                  </a>
                  <a
                    href="https://www.linkedin.com/in/manoj07ar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-foreground/70 hover:text-primary transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    Contact the Developer
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} VANO. All rights reserved.</span>
            <span>Made in Galway 🇮🇪</span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
};

export default Landing;
