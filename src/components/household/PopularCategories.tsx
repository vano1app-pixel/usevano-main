import React from 'react';
import { motion } from 'framer-motion';
import { getHouseholdPriceCents } from '@/lib/householdPricing';
import { haptic } from '@/lib/haptics';

/**
 * The three most-booked services as one-tap tiles — the quick alternative to the
 * search bar in the hero (some people would rather tap than type). Tapping a tile
 * fires `vano:select-category`, which the hero's CategoryGrid listens for and
 * opens its booking sheet — so this reuses the ONE booking flow, at the canonical
 * core-category prices (src/lib/householdPricing.ts). Replaced the House Autopilot
 * band on the landing page.
 */

const POPULAR: { slug: string; emoji: string; label: string; size: string; scope: string; popular?: boolean }[] = [
  { slug: 'shopping', emoji: '🧺', label: 'Laundry',  size: '',        scope: 'Washed & folded' },
  { slug: 'cleaning', emoji: '🧹', label: 'Cleaning', size: '2 hours', scope: 'Kitchen, bath, floors', popular: true },
  { slug: 'dog-walk', emoji: '🐕', label: 'Dog walk', size: '30 min',  scope: 'On-lead, door to door' },
];

function fmt(cents: number): string {
  const eur = cents / 100;
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
}

function selectCategory(slug: string, size: string): void {
  haptic(10); // gentle confirm tick on supported phones
  window.dispatchEvent(new CustomEvent('vano:select-category', { detail: { slug, size: size || undefined } }));
}

// Button drives the hover/tap state; the emoji rides the same `hover` variant so
// it springs and wiggles when the tile is hovered (delight, not just a lift).
const tileV = {
  hidden: { opacity: 0, y: 18, scale: 0.95 },
  show:   { opacity: 1, y: 0, scale: 1 },
  hover:  { y: -6 },
  tap:    { scale: 0.96 },
};
const emojiV = {
  hidden: { scale: 1, rotate: 0 },
  show:   { scale: 1, rotate: 0 },
  hover:  { scale: 1.22, rotate: [0, -12, 10, -6, 0] },
  tap:    { scale: 0.85 },
};
// The price springs up a beat after its tile lands — a tiny "ta-da" on the
// number people actually care about. Rides the tile's hidden/show state.
const priceV = {
  hidden: { scale: 0.5, opacity: 0 },
  show:   { scale: 1, opacity: 1, transition: { type: 'spring' as const, stiffness: 500, damping: 16, delay: 0.16 } },
};

export const PopularCategories: React.FC = () => {
  return (
    <section id="popular" className="relative bg-navy px-4 py-24 sm:py-28 lg:py-32 scroll-mt-20">
      {/* Soft seams — the navy band melts in and out of the cream sections above
          and below it, instead of a hard colour cut. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-cream to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-cream to-transparent" aria-hidden="true" />

      <div className="relative max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-12 lg:mb-14"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Popular services</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white text-balance" style={{ letterSpacing: '-0.02em' }}>
            Our most-booked help
          </h2>
          <p className="text-white/55 text-sm sm:text-base mt-3 max-w-md mx-auto text-pretty">
            Tap one to book in seconds — or search for anything else up top.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-3 gap-3 sm:gap-4"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } }}
        >
          {POPULAR.map((c) => {
            const cents = getHouseholdPriceCents(c.slug, c.size);
            return (
              <motion.button
                key={c.slug}
                type="button"
                onClick={() => selectCategory(c.slug, c.size)}
                variants={tileV}
                whileHover="hover"
                whileTap="tap"
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                className="tile-float group relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-black/5 bg-white px-2 py-5 sm:px-4 sm:py-7 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {c.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 overflow-hidden rounded-full bg-gold px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-navy whitespace-nowrap">
                    Most booked
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 -translate-x-full animate-[shimmer_3s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent"
                    />
                  </span>
                )}
                <motion.span
                  className="text-3xl sm:text-4xl leading-none select-none"
                  variants={emojiV}
                  transition={{ duration: 0.45, ease: 'easeInOut' }}
                  aria-hidden="true"
                >
                  {c.emoji}
                </motion.span>
                <span className="text-sm sm:text-base font-bold text-foreground mt-1">{c.label}</span>
                <motion.span variants={priceV} className="text-lg sm:text-xl font-extrabold text-foreground tabular-nums leading-none">
                  {cents != null ? fmt(cents) : 'from €15'}
                </motion.span>
                <span className="hidden sm:block text-[11px] font-medium text-muted-foreground leading-tight">{c.scope}</span>
              </motion.button>
            );
          })}
        </motion.div>

        <p className="text-center text-white/45 text-sm mt-10">
          No payment until a helper accepts · money-back guarantee
        </p>
      </div>
    </section>
  );
};
