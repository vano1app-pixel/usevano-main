import React from 'react';
import { Zap } from 'lucide-react';
import { track } from '@/lib/track';

/**
 * The last word on the page. The journey used to end on the blog teaser +
 * footer — a reader who'd just had their objections answered by the FAQ (the
 * highest-intent moment on the whole page) was left with NO way to act.
 * One navy band, one honest line, one button back to the tiles.
 */
export const ClosingCta: React.FC = () => {
  const scrollToBook = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    track('closing_cta_tap');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('book')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <section className="relative bg-navy rounded-[2rem] sm:rounded-[3rem] px-4 py-20 sm:py-24 text-center">
      {/* Rounded-slab seam (see PopularCategories) — curved corners into the
          cream, no gradients (they smeared grey on real phones).
          No internal whileInView here: HouseholdHome already wraps this whole
          band in <Reveal> — a second entrance made the slab fade in twice. */}
      <div className="relative max-w-md mx-auto">
        <p className="eyebrow text-white/40 before:bg-white/25 mb-3">Ready when you are</p>
        <h2 className="display-lg text-white text-balance mb-3">
          Book help in 30 seconds
        </h2>
        <p className="text-white/70 text-sm sm:text-base mb-8 text-pretty leading-relaxed">
          Same-day in Galway. You only pay once a helper says yes.
        </p>
        <a
          href="#book"
          onClick={scrollToBook}
          className="inline-flex h-[52px] items-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-primary-glow hover:bg-sage-dark active:scale-[0.97] transition-[transform,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Zap className="w-4 h-4" aria-hidden="true" />
          Pick a job — takes a minute
        </a>
      </div>
    </section>
  );
};
