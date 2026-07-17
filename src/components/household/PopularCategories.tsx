import React from 'react';
import { motion } from 'framer-motion';
import { getHouseholdPriceCents } from '@/lib/householdPricing';
import { haptic } from '@/lib/haptics';

/**
 * The three most-booked services as a winner's podium — cleaning takes the tall
 * gold #1 step in the middle, laundry the silver #2 on the left, dog walks the
 * bronze #3 on the right (classic 2-1-3 podium ordering). Each step is a one-tap
 * tile: tapping fires `vano:select-category`, which the hero's CategoryGrid
 * listens for and opens its booking sheet — so this reuses the ONE booking flow,
 * at the canonical core-category prices (src/lib/householdPricing.ts).
 */

type Popular = { slug: string; emoji: string; label: string; size: string; scope: string; rank: 1 | 2 | 3 };

// Array order is the visual left→right order: #2, #1, #3 (podium ordering).
const POPULAR: Popular[] = [
  { slug: 'shopping', emoji: '🧺', label: 'Laundry',  size: '',        scope: 'Washed & folded',     rank: 2 },
  { slug: 'cleaning', emoji: '🧹', label: 'Cleaning', size: '2 hours', scope: 'Kitchen, bath, floors', rank: 1 },
  { slug: 'dog-walk', emoji: '🐕', label: 'Dog walk', size: '30 min',  scope: 'On-lead, door to door', rank: 3 },
];

// Per-place styling: step height (the podium silhouette), the bar gradient, the
// big rank number colour, and the medal. #1 is tallest + gold; #3 shortest + bronze.
const PODIUM: Record<1 | 2 | 3, { step: string; bar: string; num: string; medal: string; ring: string; tile: string }> = {
  1: { step: 'h-24 sm:h-28', bar: 'from-gold to-amber-600',        num: 'text-navy',     medal: '🥇', ring: 'ring-2 ring-gold ring-offset-2 ring-offset-navy', tile: 'sm:scale-105' },
  2: { step: 'h-16 sm:h-20', bar: 'from-slate-200 to-slate-400',   num: 'text-slate-700', medal: '🥈', ring: '', tile: '' },
  3: { step: 'h-12 sm:h-16', bar: 'from-amber-600 to-amber-800',   num: 'text-amber-50',  medal: '🥉', ring: '', tile: '' },
};

function fmt(cents: number): string {
  const eur = cents / 100;
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
}

function selectCategory(slug: string, size: string): void {
  haptic(10); // gentle confirm tick on supported phones
  window.dispatchEvent(new CustomEvent('vano:select-category', { detail: { slug, size: size || undefined } }));
}

// Column drives the hover/tap state; the emoji rides the same `hover` variant so
// it springs and wiggles when the tile is hovered (delight, not just a lift).
const colV = {
  hidden: { opacity: 0, y: 18, scale: 0.95 },
  show:   { opacity: 1, y: 0, scale: 1 },
};
const tileHover = { y: -6 };
const emojiV = {
  hidden: { scale: 1, rotate: 0 },
  show:   { scale: 1, rotate: 0 },
  hover:  { scale: 1.22, rotate: [0, -12, 10, -6, 0] },
  tap:    { scale: 0.85 },
};
// The price springs up a beat after its tile lands — a tiny "ta-da" on the
// number people actually care about. Rides the column's hidden/show state.
const priceV = {
  hidden: { scale: 0.5, opacity: 0 },
  show:   { scale: 1, opacity: 1, transition: { type: 'spring' as const, stiffness: 500, damping: 16, delay: 0.16 } },
};
// The step grows up from the floor like a real podium rising into place.
const stepV = {
  hidden: { scaleY: 0 },
  show:   { scaleY: 1, transition: { type: 'spring' as const, stiffness: 200, damping: 22, delay: 0.2 } },
};

export const PopularCategories: React.FC = () => {
  return (
    <section id="popular" className="relative bg-navy px-4 py-24 sm:py-28 lg:py-32 scroll-mt-20">
      {/* No gradient seams — the cream→navy fades rendered as muddy grey
          smears on real phones (owner: "that looks awful"). Hard edges. */}
      <div className="relative max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-12 lg:mb-16"
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Popular services</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white text-balance" style={{ letterSpacing: '-0.02em' }}>
            Our most-booked help
          </h2>
          <p className="text-white/70 text-sm sm:text-base mt-3 max-w-md mx-auto text-pretty">
            Tap a step to book in seconds — or hit “Anything else” up top.
          </p>
        </motion.div>

        {/* The podium: three columns aligned to a shared floor, each = tile on top
            of a numbered step. items-end pins every step to the same baseline, so
            the taller #1 step lifts the cleaning tile above the other two. */}
        <motion.div
          className="grid grid-cols-3 items-end gap-2 sm:gap-4 max-w-2xl mx-auto"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } } }}
        >
          {POPULAR.map((c) => {
            const cents = getHouseholdPriceCents(c.slug, c.size);
            const p = PODIUM[c.rank];
            return (
              <motion.div key={c.slug} variants={colV} className="flex flex-col items-center">
                {/* Crown floats over the champion tile */}
                {c.rank === 1 && (
                  <motion.span
                    className="text-2xl sm:text-3xl leading-none select-none mb-0.5"
                    aria-hidden="true"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    👑
                  </motion.span>
                )}

                {/* The tile */}
                <motion.button
                  type="button"
                  onClick={() => selectCategory(c.slug, c.size)}
                  whileHover={tileHover}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  className={`tile-float group relative z-10 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border border-black/5 bg-white px-1.5 py-4 sm:px-3 sm:py-6 text-center origin-bottom focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${p.ring} ${p.tile}`}
                >
                  {/* Medal badge in the corner */}
                  <span className="absolute -top-2 -left-2 text-lg sm:text-xl leading-none select-none drop-shadow" aria-hidden="true">
                    {p.medal}
                  </span>

                  {c.rank === 1 && (
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
                    whileHover="hover"
                    whileTap="tap"
                    transition={{ duration: 0.45, ease: 'easeInOut' }}
                    aria-hidden="true"
                  >
                    {c.emoji}
                  </motion.span>
                  <span className="text-xs sm:text-base font-bold text-foreground mt-1">{c.label}</span>
                  <motion.span variants={priceV} className="text-base sm:text-xl font-extrabold text-foreground tabular-nums leading-none">
                    {cents != null ? fmt(cents) : 'from €15'}
                  </motion.span>
                  <span className="hidden sm:block text-[11px] font-medium text-muted-foreground leading-tight">{c.scope}</span>
                </motion.button>

                {/* The step — a numbered plinth that grows up from the floor */}
                <div className={`relative w-full ${p.step}`}>
                  <motion.div
                    variants={stepV}
                    style={{ transformOrigin: 'bottom' }}
                    className={`absolute inset-x-1 sm:inset-x-2 bottom-0 top-0 rounded-t-md bg-gradient-to-b ${p.bar} shadow-lg`}
                    aria-hidden="true"
                  />
                  <span className={`absolute inset-0 flex items-start justify-center pt-2 font-black text-2xl sm:text-3xl tabular-nums ${p.num}`}>
                    {c.rank}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <p className="text-center text-white/60 text-sm mt-10">
          No payment until a helper accepts · money-back guarantee
        </p>
      </div>
    </section>
  );
};
