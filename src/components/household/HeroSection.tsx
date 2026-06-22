import React from 'react';
import { ShieldCheck, Eye, CreditCard, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useHelperCount } from '@/hooks/useHelperCount';
import { useCountUp } from '@/hooks/useCountUp';
import { CategoryGrid } from './CategoryGrid';
import { ReferralWelcomeBanner } from './ReferralWelcomeBanner';
import { ScrollCue } from './ScrollCue';

/**
 * Hero = one job: get a category tapped. Left column carries a few quiet
 * trust one-liners (icon + label), right column is the booking card.
 * No weather nudges, no pill cards — anything that competes with the
 * card for attention was cut.
 */

const TRUST = [
  { icon: ShieldCheck, text: 'ID-verified & vetted',  short: 'ID-verified & vetted' },
  { icon: Eye,         text: 'You see them first',    short: 'You see them first' },
  { icon: CreditCard,  text: 'Protected payment',     short: 'Protected payment' },
  { icon: BadgeCheck,  text: 'Money-back guarantee',  short: 'Money-back guarantee' },
];

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Working late?';
}

export const HeroSection: React.FC = () => {
  const helperCount = useHelperCount();
  const displayCount = useCountUp(helperCount);
  const greeting = timeGreeting();

  return (
    // Natural height on mobile (no stretched gaps); full-screen centred on desktop
    <section id="book" data-snap className="relative overflow-hidden bg-navy px-4 pt-24 pb-12 lg:pt-20 lg:pb-16 lg:min-h-screen lg:flex lg:items-center">
      {/* Grain on dark background */}
      <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      {/* Subtle radial glow — top left, warm. Breathes slowly so the hero feels
          alive without pulling focus from the booking card. */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.35) 0%, transparent 70%)' }}
        initial={{ opacity: 0.16, scale: 1 }}
        animate={{ opacity: [0.16, 0.26, 0.16], scale: [1, 1.08, 1] }}
        transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto w-full">
        <div className="lg:grid lg:grid-cols-[1fr,440px] lg:gap-12 lg:items-center">

          {/* ── Left column — pitch ── */}
          <div className="mb-7 lg:mb-0">

            <ReferralWelcomeBanner />

            {/* Live pill — one pill, count + place */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-5"
            >
              {displayCount === 0 ? (
                /* Skeleton shimmer while count loads */
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5 overflow-hidden relative">
                  <span className="w-2 h-2 rounded-full bg-emerald-400/40 flex-shrink-0" aria-hidden="true" />
                  <span className="w-36 h-3 rounded-full bg-emerald-400/20 relative overflow-hidden">
                    <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-emerald-300/20 to-transparent" />
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold text-emerald-300 tracking-wide">
                    {displayCount} helpers online · Galway
                  </span>
                </div>
              )}
            </motion.div>

            {/* Headline — Bricolage Grotesque via display-xl */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="display-xl text-white mb-4"
            >
              Same-day help,<br />from someone you trust.
            </motion.h1>

            {/* Subline — backs the "someone you trust" promise with the core
                differentiator: you see the helper before they arrive. */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-white/70 text-base sm:text-lg leading-relaxed max-w-md"
            >
              ID-verified local students — see their name, photo and rating before they arrive.
            </motion.p>

            {/* Trust — quiet rows, desktop only (mobile gets the strip below the card) */}
            <ul className="hidden lg:flex flex-col gap-2.5 mt-8">
              {TRUST.map(({ icon: Icon, text }, i) => (
                <motion.li
                  key={text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.24 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2.5 text-sm text-white/70"
                >
                  <Icon className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
                  {text}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* ── Right column — booking card. The whole point of the page. ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="bg-cream rounded-3xl shadow-2xl p-5 lg:p-6 border border-foreground/15"
          >
            <div className="mb-4">
              <p className="text-sm font-semibold text-foreground/80">
                {greeting} <span aria-hidden="true">👋</span>
              </p>
              <div className="flex items-baseline justify-between gap-3 mt-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-foreground/40">
                  What do you need?
                </p>
                {/* Surfaces the server's book-ahead discount before the sheet opens */}
                <p className="text-[11px] font-semibold text-sage-dark whitespace-nowrap">
                  Book ahead · 10% off
                </p>
              </div>
            </div>
            <CategoryGrid />
          </motion.div>

        </div>

        {/* Mobile trust strip — one glance, under the card; fades in last */}
        <motion.ul
          className="lg:hidden mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.38 } } }}
        >
          {TRUST.map(({ icon: Icon, short }) => (
            <motion.li
              key={short}
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              className="inline-flex items-center gap-1.5 text-xs text-white/60"
            >
              <Icon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
              {short}
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {/* Desktop scroll cue — once the hero settles (delay), a gentle nudge to
          the next section. Light tone for the navy background. */}
      <ScrollCue tone="light" delay={1.2} />
    </section>
  );
};
