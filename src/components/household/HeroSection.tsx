import React, { useEffect, useState } from 'react';
import { ShieldCheck, Zap, ThumbsUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CategoryGrid } from './CategoryGrid';

const TRUST = [
  { icon: ShieldCheck, text: 'All students are screened before joining' },
  { icon: Zap,         text: 'See their photo and name before they arrive' },
  { icon: ThumbsUp,    text: "Money back if the job isn't done right." },
];

const SEED = 3;

export const HeroSection: React.FC = () => {
  const [helperCount, setHelperCount] = useState<number>(5);

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
            {/* Availability pill */}
            <div className="flex flex-wrap items-center gap-2 mb-5 lg:mb-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold text-emerald-700 tracking-wide">
                  {helperCount} helpers available now
                </span>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 border border-primary/15 px-3 py-1">
                <span className="text-xs font-semibold text-primary tracking-wide">🚀 Growing from Galway</span>
              </div>
            </div>

            <h1 className="text-[2.2rem] leading-[1.08] font-extrabold tracking-tight text-foreground mb-5 sm:text-[2.8rem] lg:text-6xl lg:mb-8">
              Get any task done today —<br />by a local student.
            </h1>

            {/* Trust badges */}
            <ul className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:gap-2.5">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2 text-xs sm:text-sm text-foreground/70">
                  <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-sage flex-shrink-0" aria-hidden="true" />
                  {text}
                </li>
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
