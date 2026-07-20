import React from 'react';
import { motion } from 'framer-motion';
import { Link2, Share2, Coins, ShieldCheck, Mail, Eye } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { PartnerProgramCard } from '@/components/household/PartnerProgramCard';

/**
 * /partners — the recruiter-facing door for the partner programme. Audience is
 * NOT customers and NOT applicants: it's the people who can bring students in
 * bulk (student unions, societies, class reps) plus helpers who want to recruit
 * friends. One page: the promise (3% of every job, automatically), how it
 * works, the honest money facts (paid from VANO's fee — students keep 100%),
 * and the live PartnerProgramCard as the sign-up + tracker.
 */

const STEPS = [
  {
    icon: Link2,
    title: 'Get your link',
    body: 'Enter your email below — you get a personal invite link in seconds. No forms, no login.',
  },
  {
    icon: Share2,
    title: 'Share it once',
    body: 'Class group chat, society page, a poster in the common room. Every student who joins through your link is yours — for good.',
  },
  {
    icon: Coins,
    title: 'Earn on every job',
    body: 'Each time one of your students completes a job, 3% of that job lands in your balance. Automatically, every job, for as long as they work.',
  },
];

const FACTS = [
  {
    icon: ShieldCheck,
    title: 'Students keep 100%',
    body: "Your cut comes out of VANO's booking fee — never from the student's pay.",
  },
  {
    icon: Eye,
    title: 'See every cent',
    body: 'A live tracker shows each job, who did it, and what you earned — as it happens.',
  },
  {
    icon: Mail,
    title: 'Money lands, you hear about it',
    body: "We email you every time you earn, and transfer your balance straight to you.",
  },
];

const Partners: React.FC = () => (
  <div className="bg-cream min-h-screen">
    <SEOHead
      title="VANO partners — earn 3% of every job your students do"
      description="Know students in Galway? Share one link. When a student you invited completes jobs on VANO, you automatically earn 3% of each job — tracked live, paid to you."
      url="https://vanojobs.com/partners"
    />
    <HouseholdNav />

    <main className="pt-24 pb-16 px-4">
      {/* Hero */}
      <section className="max-w-2xl mx-auto text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="eyebrow justify-center mb-3"
        >
          VANO partner programme
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="display-lg text-foreground text-balance tracking-tight text-3xl sm:text-5xl mb-4"
        >
          Know students? Earn 3% of every job they do.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="text-base sm:text-lg text-foreground/70 max-w-xl mx-auto"
        >
          Share one link. When a student you invited completes jobs on VANO, your
          cut lands automatically — tracked live, emailed to you each time.
        </motion.p>
      </section>

      {/* The card IS the signup + tracker */}
      <section id="get-my-link" className="max-w-sm mx-auto mt-8">
        <PartnerProgramCard />
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto mt-14">
        <p className="eyebrow justify-center mb-6">How it works</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="surface-float rounded-2xl bg-white p-5 text-center"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-sage/15 mb-3">
                <s.icon className="w-5 h-5 text-sage-dark" aria-hidden="true" />
              </span>
              <p className="text-base font-bold text-foreground mb-1.5">{i + 1}. {s.title}</p>
              <p className="text-sm text-foreground/70 leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* The honest money facts — navy band, matching the mid-page slabs */}
      <section className="max-w-3xl mx-auto mt-12">
        <div className="rounded-[2rem] bg-navy px-6 py-8 sm:px-10 sm:py-10">
          <p className="eyebrow justify-center mb-6 !text-white/60">Where the money comes from</p>
          <div className="grid gap-6 sm:grid-cols-3">
            {FACTS.map((f) => (
              <div key={f.title} className="text-center">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 mb-3">
                  <f.icon className="w-5 h-5 text-gold" aria-hidden="true" />
                </span>
                <p className="text-[15px] font-bold text-white mb-1">{f.title}</p>
                <p className="text-sm text-white/70 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who it's for + worked example */}
      <section className="max-w-2xl mx-auto mt-12 text-center">
        <p className="eyebrow justify-center mb-3">Made for</p>
        <p className="text-base text-foreground/80 leading-relaxed">
          Student unions and societies raising funds. Class reps with a group
          chat. Students already helping on VANO who want their friends in.
        </p>
        <div className="surface-float rounded-2xl bg-white px-5 py-4 mt-6 inline-block">
          <p className="text-sm text-foreground/70">
            One student doing <span className="font-semibold text-foreground">two €36 cleans a week</span> earns
            you <span className="font-bold text-sage-dark tabular-nums">€2.16 a week</span> —
            per student, while you do nothing.
          </p>
        </div>
        <div className="mt-8">
          <a
            href="#get-my-link"
            className="inline-flex items-center justify-center rounded-full bg-sage px-7 py-3.5 text-[15px] font-semibold text-white shadow-sm hover:brightness-105 active:scale-[0.98] transition"
          >
            Get my link — it takes 10 seconds
          </a>
        </div>
      </section>
    </main>

    <HouseholdFooter />
  </div>
);

export default Partners;
