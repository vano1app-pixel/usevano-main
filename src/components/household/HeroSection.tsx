import React from 'react';
import { CategoryGrid } from './CategoryGrid';

/* Hero — grain texture from index.css utility breaks digital flatness.
   Gradient is feather-light so it reads as tinted-white, not coloured.
   All content must sit above the fold at 375px; pt-24 clears the fixed nav. */
export const HeroSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sage-light/60 to-background pt-24 pb-10 px-4">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-lg mx-auto md:max-w-2xl">
        {/* Eyebrow */}
        <p className="eyebrow mb-5">Galway · ATU students · From €12</p>

        {/* Headline — display-xl already clamps 2.5rem → 5.75rem with tight leading */}
        <h1 className="display-xl text-foreground mb-8">
          Need a hand around the house?
        </h1>

        <CategoryGrid />
      </div>
    </section>
  );
};
