import React from 'react';
import { ShieldCheck, CreditCard, Clock } from 'lucide-react';
import { CategoryGrid } from './CategoryGrid';

const TRUST = [
  { icon: ShieldCheck, text: 'Garda vetted students' },
  { icon: CreditCard,  text: 'Card held — charged when done' },
  { icon: Clock,       text: 'Available today' },
];

export const HeroSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sage-light/40 to-background pt-20 pb-10 px-4 lg:pt-28 lg:pb-16">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-5xl mx-auto">
        <div className="lg:grid lg:grid-cols-[1fr,500px] lg:gap-14 lg:items-start">

          {/* Left */}
          <div className="mb-7 lg:mb-0 lg:pt-6">
            <h1 className="text-[2.2rem] leading-[1.08] font-extrabold tracking-tight text-foreground mb-3 sm:text-[2.8rem] lg:text-6xl lg:mb-5">
              Hire a student<br />helper, today.
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base lg:text-lg mb-5 lg:mb-8 max-w-xs lg:max-w-sm">
              Vetted students across Ireland · From €10
            </p>

            {/* Trust badges — wrap horizontally on mobile to save vertical space */}
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
