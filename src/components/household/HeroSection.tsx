import React, { useEffect, useState } from 'react';
import { ShieldCheck, Eye, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useHelperCount } from '@/hooks/useHelperCount';
import { CategoryGrid } from './CategoryGrid';
import { ReferralWelcomeBanner } from './ReferralWelcomeBanner';

/**
 * Hero = one job: get a category tapped. Left column is three quiet beats
 * (live proof → promise → guarantee), right column is the booking card.
 * No weather nudges, no pill cards — anything that competes with the
 * card for attention was cut.
 */

const TRUST = [
  { icon: ShieldCheck, text: 'Every helper screened before their first job', short: 'Screened helpers' },
  { icon: Eye,         text: 'See their name and photo before they arrive',  short: 'See who’s coming' },
  { icon: BadgeCheck,  text: 'Money back if it isn’t right — no questions',  short: 'Money-back guarantee' },
];

function useCountUp(target: number, duration = 700): number {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
}

export const HeroSection: React.FC = () => {
  const helperCount = useHelperCount();
  const displayCount = useCountUp(helperCount);

  return (
    // Natural height on mobile (no stretched gaps); full-screen centred on desktop
    <section className="relative overflow-hidden bg-navy px-4 pt-24 pb-10 lg:pt-20 lg:pb-14 lg:min-h-screen lg:flex lg:items-center">
      {/* Grain on dark background */}
      <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      {/* Subtle radial glow — top left, warm */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.35) 0%, transparent 70%)' }}
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
              Same-day help,<br />booked in seconds.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-white/65 text-base lg:text-lg leading-relaxed max-w-md"
            >
              Trusted local students from €15. Tap a job, drop your number —
              you pay nothing until a helper accepts.
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
            className="bg-cream rounded-3xl shadow-2xl p-5 lg:p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground/40 mb-4">
              What do you need?
            </p>
            <CategoryGrid />
          </motion.div>

        </div>

        {/* Mobile trust strip — one glance, under the card */}
        <ul className="lg:hidden mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {TRUST.map(({ icon: Icon, short }) => (
            <li key={short} className="inline-flex items-center gap-1.5 text-xs text-white/60">
              <Icon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
              {short}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
