import React from 'react';
import { motion } from 'framer-motion';
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
    document.getElementById('book')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative bg-navy px-4 py-20 sm:py-24 text-center">
      {/* No gradient seams — the cream→navy fades rendered as muddy grey
          smears on real phones (owner: "that looks awful"). Hard edges. */}
      <motion.div
        className="relative max-w-md mx-auto"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Ready when you are</p>
        <h2 className="text-3xl lg:text-4xl font-bold text-white text-balance mb-3" style={{ letterSpacing: '-0.02em' }}>
          Book help in 30 seconds
        </h2>
        <p className="text-white/70 text-sm sm:text-base mb-8 text-pretty leading-relaxed">
          From €15, same-day in Galway — and you're only charged when a helper accepts.
        </p>
        <a
          href="#book"
          onClick={scrollToBook}
          className="inline-flex h-[52px] items-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-primary-glow active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Zap className="w-4 h-4" aria-hidden="true" />
          Pick a job — from €15
        </a>
      </motion.div>
    </section>
  );
};
