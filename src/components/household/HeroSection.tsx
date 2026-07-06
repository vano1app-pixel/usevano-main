import React from 'react';
import { ShieldCheck, Eye, CreditCard, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useHelperCount } from '@/hooks/useHelperCount';
import { helperPresenceTier } from '@/lib/helperPresence';
import { useCountUp } from '@/hooks/useCountUp';
import { CategoryGrid } from './CategoryGrid';
import { ReferralWelcomeBanner } from './ReferralWelcomeBanner';
import { ReviewBadges } from './ReviewBadges';
import { ScrollCue } from './ScrollCue';

/**
 * Hero = one job: get a category tapped. Left column carries a few quiet
 * trust one-liners (icon + label), right column is the booking card.
 * No weather nudges, no pill cards — anything that competes with the
 * card for attention was cut.
 */

const TRUST = [
  { icon: ShieldCheck, text: 'ID-verified students', short: 'ID-verified students' },
  { icon: Eye,         text: 'You see them first',    short: 'You see them first' },
  { icon: CreditCard,  text: 'Protected payment',     short: 'Protected payment' },
  { icon: BadgeCheck,  text: 'Money-back guarantee',  short: 'Money-back guarantee' },
];

export const HeroSection: React.FC = () => {
  const { count: helperCount, ready: helperReady } = useHelperCount();
  const displayCount = useCountUp(helperCount);

  // What the live pill says, read through a nervous first-timer's eyes: they
  // take a yes/no off it, not a statistic. So show a real count only once it's
  // genuinely reassuring; below that, an honest availability line that never
  // advertises thin supply (a specific small number reads worse than none).
  const presenceTier = helperPresenceTier(helperCount, helperReady);
  const presenceLabel =
    presenceTier === 'count'      ? `${displayCount} helpers online · Galway`
    : presenceTier === 'available' ? 'Helpers available · Galway'
    : 'Same-day help in Galway'; // 'loading' is handled by the skeleton branch

  return (
    // Full-height, vertically-centred hero on every screen so the search bar owns
    // the viewport. svh (not dvh) keeps the height stable as iOS chrome
    // collapses — no jump, no phantom dead band. The asymmetric mobile padding
    // (pb > pt beyond the nav clearance) lifts the block's optical centre so
    // the search bar sits nearer the thumb line instead of drifting low.
    <section id="book" data-snap className="relative bg-navy px-4 pt-20 pb-[13vh] sm:pb-16 flex flex-col justify-center min-h-[100svh]">
      {/* Decorative background — kept in its own overflow-hidden layer so the
          section itself never clips the search dropdown that opens below the bar
          (previously overflow-hidden on the section cut the 3rd suggestion off). */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Grain on dark background */}
      <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />

      {/* Subtle radial glow — top left, warm. Breathes slowly so the hero feels
          alive without pulling focus from the booking card. */}
      <motion.div
        className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.35) 0%, transparent 70%)' }}
        initial={{ opacity: 0.16, scale: 1 }}
        animate={{ opacity: [0.16, 0.26, 0.16], scale: [1, 1.08, 1] }}
        transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
        aria-hidden="true"
      />

      {/* Second ambient layer — a cool sage glow drifting in from the bottom
          right, out of phase with the warm one. Two light sources at opposite
          corners give the flat navy real depth instead of a single hotspot. */}
      <motion.div
        className="pointer-events-none absolute -bottom-40 -right-32 w-[560px] h-[560px] rounded-full"
        style={{ background: 'radial-gradient(circle, hsl(119 23% 55% / 0.28) 0%, transparent 70%)' }}
        initial={{ opacity: 0.12, scale: 1.05 }}
        animate={{ opacity: [0.12, 0.2, 0.12], scale: [1.05, 1, 1.05] }}
        transition={{ duration: 11, ease: 'easeInOut', repeat: Infinity, delay: 1.5 }}
        aria-hidden="true"
      />
      </div>

      <div className="relative mx-auto w-full max-w-2xl text-center">

        <div className="flex justify-center">
          <ReferralWelcomeBanner />
        </div>

        {/* Review-platform trust strip — sits just above the live-presence pill
            so social proof is the first thing read. Renders platform links only
            (no fabricated scores) until real ratings exist. */}
        <ReviewBadges />

        {/* Live presence — centered */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-4 flex justify-center"
        >
          {!helperReady ? (
            /* Skeleton shimmer only while the head-count request is genuinely in
               flight — never a stuck shimmer when supply is just thin. */
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5 overflow-hidden relative">
              <span className="w-2 h-2 rounded-full bg-emerald-400/40 flex-shrink-0" aria-hidden="true" />
              <span className="w-36 h-3 rounded-full bg-emerald-400/20 relative overflow-hidden">
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-emerald-300/20 to-transparent" />
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-emerald-300 tracking-wide">
                {presenceLabel}
              </span>
            </div>
          )}
        </motion.div>

        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="display-lg text-white mb-3 text-balance text-[1.75rem] sm:text-[2.25rem] leading-[1.08]"
        >
          Same-day help, from someone you{' '}
          <span className="relative inline-block">
            trust
            {/* Gold underline literally draws itself in under the promise word,
                a beat after the headline lands — small reveal, big focus. */}
            <motion.span
              aria-hidden="true"
              className="absolute left-0 right-0 -bottom-1 h-[3px] rounded-full bg-gold/90 origin-left"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>.
        </motion.h1>

        {/* Subline — the trust differentiator */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="text-white/65 text-sm sm:text-base leading-relaxed max-w-md mx-auto mb-6 text-pretty"
        >
          ID-verified students — see their photo &amp; rating before they arrive.
        </motion.p>

        {/* The one front door — big centered search bar (type → pick → price).
            A soft warm halo sits behind it so the white bar reads as THE focal
            point against the navy, not just another element in the stack. */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[125%] h-[220%] rounded-full blur-2xl"
            style={{ background: 'radial-gradient(ellipse at center, hsl(43 92% 60% / 0.16), transparent 65%)' }}
          />
          <div className="relative z-10">
            <CategoryGrid />
          </div>
        </motion.div>

        {/* Trust — centered glass chips, one row that wraps on mobile */}
        <motion.ul
          className="mt-8 flex flex-wrap items-center justify-center gap-2"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.42 } } }}
        >
          {TRUST.map(({ icon: Icon, short }) => (
            <motion.li
              key={short}
              variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)] transition-colors duration-200 hover:bg-white/[0.11]"
            >
              <Icon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
              {short}
            </motion.li>
          ))}
        </motion.ul>
      </div>

      {/* Desktop scroll cue — once the hero settles (delay), a gentle nudge to
          the next section. Light tone for the navy background. */}
      <ScrollCue tone="light" delay={1.2} />
    </section>
  );
};
