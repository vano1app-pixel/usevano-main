import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { CategoryGrid } from './CategoryGrid';

const TRUST = [
  { icon: ShieldCheck, text: 'Every student is screened before their first job' },
  { icon: Zap,         text: "You'll see their photo and name before they arrive" },
  { icon: BadgeCheck,  text: 'Full refund if the job isn\'t done right — no questions' },
];

const SEED = 3;

function useCountUp(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  useEffect(() => {
    const start = Date.now();
    const from = 0;
    const raf = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * ease));
      if (progress < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

export const HeroSection: React.FC = () => {
  const [helperCount, setHelperCount] = useState<number>(0);
  const displayCount = useCountUp(helperCount, 700);

  useEffect(() => {
    (supabase as any)
      .from('household_helpers')
      .select('*', { count: 'exact', head: true })
      .then(({ count }: { count: number | null }) => {
        if (count !== null) setHelperCount(Math.max(5, count * 2 + SEED));
      });
  }, []);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sage-light/40 to-background pt-20 pb-10 px-4 lg:pt-28 lg:pb-16">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-5xl mx-auto">
        <div className="lg:grid lg:grid-cols-[1fr,500px] lg:gap-14 lg:items-start">

          {/* Left */}
          <div className="mb-7 lg:mb-0 lg:pt-6">
            {/* Availability pill — count animates in */}
            <div className="flex flex-wrap items-center gap-2 mb-5 lg:mb-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-emerald-700 tracking-wide">
                  {displayCount} helpers available now
                </span>
              </motion.div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 border border-primary/15 px-3 py-1">
                <span className="text-xs font-semibold text-primary tracking-wide">🚀 Growing from Galway</span>
              </div>
            </div>

            <h1 className="text-[2.2rem] leading-[1.08] font-extrabold tracking-tight text-foreground mb-3 sm:text-[2.8rem] lg:text-6xl">
              Someone local,<br />here when you need it.
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed mb-6 max-w-sm lg:text-lg lg:mb-8">
              Real students from your area. Booked in seconds, paid by card — and if it's not right, you get your money back.
            </p>

            {/* Trust badges — pill cards */}
            <ul className="flex flex-col gap-2.5">
              {TRUST.map(({ icon: Icon, text }, i) => (
                <motion.li
                  key={text}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-center gap-2.5 bg-background/70 border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground/80"
                >
                  <Icon className="w-4 h-4 text-sage flex-shrink-0" aria-hidden="true" />
                  {text}
                </motion.li>
              ))}
            </ul>
          </div>

          {/* Right — booking widget */}
          <div className="lg:bg-card lg:rounded-2xl lg:shadow-lg lg:border lg:border-border/40 lg:p-7">
            <CategoryGrid />
          </div>
        </div>
      </div>
    </section>
  );
};
