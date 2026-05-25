import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CategoryGrid } from './CategoryGrid';

const TRUST = [
  'Every student Garda vetted',
  'Duo rule for all indoor jobs',
  "Not happy? You don't pay.",
];

export const HeroSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sage-light/60 to-background pt-24 pb-10 px-4 lg:pb-20">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-5xl mx-auto">
        {/* Two-column on lg: headline + trust left, booking widget right */}
        <div className="lg:grid lg:grid-cols-[1fr,420px] lg:gap-14 lg:items-start">

          {/* Left — headline, subtext, desktop trust list */}
          <div className="mb-8 lg:mb-0 lg:pt-6">
            <h1 className="display-xl text-foreground mb-4">
              Someone to help — today.
            </h1>
            <p className="text-muted-foreground text-base lg:text-lg mb-6 max-w-md">
              Vetted ATU students · Galway · From €12 · Pay by card or cash
            </p>

            {/* Trust checklist — desktop only; mobile sees the SafetyBanner below */}
            <ul className="hidden lg:flex flex-col gap-3">
              {TRUST.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-foreground/65">
                  <CheckCircle2 className="w-4 h-4 text-sage flex-shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — booking widget, elevated as a card on desktop */}
          <div className="lg:bg-card lg:rounded-2xl lg:shadow-lg lg:border lg:border-border/40 lg:p-5">
            <CategoryGrid />
          </div>
        </div>
      </div>
    </section>
  );
};
