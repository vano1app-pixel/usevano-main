import React from 'react';
import { ShieldCheck, CreditCard, Clock } from 'lucide-react';
import { CategoryGrid } from './CategoryGrid';

const TRUST = [
  { icon: ShieldCheck, text: 'Garda vetted students' },
  { icon: CreditCard,  text: 'Pay by card — held until done' },
  { icon: Clock,       text: 'Available today' },
];

export const HeroSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sage-light/50 to-background pt-24 pb-12 px-4 lg:pb-16">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-5xl mx-auto">
        <div className="lg:grid lg:grid-cols-[1fr,420px] lg:gap-14 lg:items-start">

          {/* Left */}
          <div className="mb-10 lg:mb-0 lg:pt-4">
            <h1 className="text-[2.6rem] leading-[1.1] font-extrabold tracking-tight text-foreground mb-4 lg:text-6xl">
              Hire a student<br />helper, today.
            </h1>
            <p className="text-muted-foreground text-base lg:text-lg mb-8 max-w-sm">
              Vetted students across Ireland · From €12
            </p>

            <ul className="flex flex-col gap-2.5">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-sm text-foreground/70">
                  <Icon className="w-4 h-4 text-sage flex-shrink-0" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — booking widget */}
          <div className="lg:bg-card lg:rounded-2xl lg:shadow-lg lg:border lg:border-border/40 lg:p-5">
            <CategoryGrid />
          </div>
        </div>
      </div>
    </section>
  );
};
