import React from 'react';
import { CategoryGrid } from './CategoryGrid';

/* Hero sits at the top of /home. The sage-light gradient fades into pure
   white so sections below feel continuous rather than boxed-in. The .grain
   overlay adds just enough texture to stop the flat white from reading as
   unfinished. Both headline and category grid must be visible without
   scrolling at 375px — padding is tuned to clear the 56px fixed nav. */
export const HeroSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sage-light via-background to-background pt-24 pb-10 px-4">
      {/* Film-grain texture — defined in index.css @layer utilities */}
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-lg mx-auto md:max-w-xl lg:max-w-2xl">
        <h1 className="display-xl text-foreground mb-3">
          Need something done?{' '}
          <span className="text-primary">We'll send someone.</span>
        </h1>

        <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
          Vetted ATU students&nbsp;·&nbsp;From €12&nbsp;·&nbsp;Galway
        </p>

        <CategoryGrid />
      </div>
    </section>
  );
};
