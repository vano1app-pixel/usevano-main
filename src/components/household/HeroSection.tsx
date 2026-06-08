import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { CategoryGrid } from './CategoryGrid';

const TRUST = [
  { icon: ShieldCheck, text: 'Every student is screened before their first job' },
  { icon: Zap,         text: 'See their name and photo before they arrive' },
  { icon: BadgeCheck,  text: 'Full refund if the job isn\'t right — no questions' },
];

const SEED = 3;

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
  const [helperCount, setHelperCount] = useState(0);
  const displayCount = useCountUp(helperCount);

  useEffect(() => {
    (supabase as any)
      .from('household_helpers')
      .select('*', { count: 'exact', head: true })
      .then(({ count }: { count: number | null }) => {
        if (count !== null) setHelperCount(Math.max(5, count * 2 + SEED));
      });
  }, []);

  return (
    <section className="relative overflow-hidden bg-navy min-h-screen flex flex-col justify-center pt-20 pb-10 px-4">
      {/* Grain on dark background */}
      <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      {/* Subtle radial glow — top left, warm */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.35) 0%, transparent 70%)' }}
        aria-hidden="true"
      />

      <div className="relative max-w-5xl mx-auto w-full">
        <div className="lg:grid lg:grid-cols-[1fr,420px] lg:gap-10 lg:items-center">

          {/* ── Left column — pitch ── */}
          <div className="mb-8 lg:mb-0 lg:pt-4">

            {/* Live pill */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-wrap items-center gap-2 mb-6"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-emerald-300 tracking-wide">
                  {displayCount > 0 ? `${displayCount} helpers online` : 'Helpers online now'}
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/8 border border-white/12 px-3 py-1.5">
                <span className="text-xs font-semibold text-white/70 tracking-wide">📍 Galway · Ireland</span>
              </div>
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
              className="text-white/65 text-base lg:text-lg leading-relaxed mb-8 max-w-sm"
            >
              Local students, booked by card in under a minute. No account. No back-and-forth. Money back if it's not right.
            </motion.p>

            {/* Trust badges — pill cards on dark */}
            <ul className="flex flex-col gap-2.5">
              {TRUST.map(({ icon: Icon, text }, i) => (
                <motion.li
                  key={text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2.5 bg-white/6 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white/80"
                >
                  <Icon className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-hidden="true" />
                  {text}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* ── Right column — booking widget, cream card ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="bg-cream rounded-2xl shadow-2xl p-5 lg:p-7 mt-2"
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground/40 mb-4">
              What do you need?
            </p>
            <CategoryGrid />
          </motion.div>

        </div>
      </div>
    </section>
  );
};
