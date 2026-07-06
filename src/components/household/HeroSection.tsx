import React from 'react';
import { motion } from 'framer-motion';
import { useHelperCount } from '@/hooks/useHelperCount';
import { helperPresenceTier } from '@/lib/helperPresence';
import { useCountUp } from '@/hooks/useCountUp';
import { CategoryGrid } from './CategoryGrid';
import { ReferralWelcomeBanner } from './ReferralWelcomeBanner';
import { ReviewBadges } from './ReviewBadges';
import { ScrollCue } from './ScrollCue';

/**
 * Hero = one job: get the search bar tapped. Minimal + warm build — one calm
 * social-proof row (Trustpilot + live presence as matching glass chips), a warm
 * heading, the white search bar glowing at centre under an amber halo, and one
 * gentle reassurance line beneath. Nothing loud, nothing stacked.
 */

export const HeroSection: React.FC = () => {
  const { count: helperCount, ready: helperReady } = useHelperCount();
  const displayCount = useCountUp(helperCount);

  const presenceTier = helperPresenceTier(helperCount, helperReady);
  const presenceLabel =
    presenceTier === 'count'      ? `${displayCount} helpers online · Galway`
    : presenceTier === 'available' ? 'Helpers available · Galway'
    : 'Same-day help in Galway';

  return (
    <section id="book" data-snap className="relative bg-navy px-4 pt-20 pb-[13vh] sm:pb-16 flex flex-col justify-center min-h-[100svh]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />
        <motion.div
          className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.35) 0%, transparent 70%)' }}
          initial={{ opacity: 0.16, scale: 1 }}
          animate={{ opacity: [0.16, 0.26, 0.16], scale: [1, 1.08, 1] }}
          transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
          aria-hidden="true"
        />
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

        {/* Two stacked centered rows: (1) the trust-badges row — Trustpilot now,
            room to grow with Yelp/Google as they come online; (2) the live
            "helpers online" number on its own centered row directly beneath. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 sm:mb-10 flex flex-col items-center gap-2.5"
        >
          <ReviewBadges inline />
          {!helperReady ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5 backdrop-blur-sm shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)]">
              <span className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" aria-hidden="true" />
              <span className="w-28 h-3 rounded-full bg-white/10 relative overflow-hidden">
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.08)]">
              <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-white/80 tracking-wide whitespace-nowrap">{presenceLabel}</span>
            </span>
          )}
        </motion.div>

        {/* Heading — warm, generous. Signature gold underline draws under "trust". */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="display-lg text-white text-balance tracking-tight text-[2rem] leading-[1.06] sm:text-[2.75rem] sm:leading-[1.04] mb-6 sm:mb-7"
        >
          Same-day help, from someone you{' '}
          <span className="relative inline-block">
            trust
            <motion.span
              aria-hidden="true"
              className="absolute left-0 right-0 -bottom-1 h-[3px] rounded-full bg-gold/90 origin-left"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>.
        </motion.h1>

        {/* The one front door — white search bar at centre under a warm amber
            halo (two-stop gold→amber) so it glows as the focal point. */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[135%] h-[240%] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(ellipse at center, hsl(43 92% 62% / 0.20), hsl(28 90% 60% / 0.10) 45%, transparent 68%)' }}
          />
          <div className="relative z-10">
            <CategoryGrid />
          </div>
        </motion.div>

        {/* One gentle reassurance line — replaces the old subline + 4 chips. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-5 sm:mt-6 max-w-md mx-auto text-xs sm:text-[13px] leading-relaxed text-white/55 text-pretty"
        >
          ID-verified
          <span className="text-white/25 px-1.5">·</span>
          you see them first
          <span className="text-white/25 px-1.5">·</span>
          pay after they accept
        </motion.p>
      </div>

      <ScrollCue tone="light" delay={1.2} />
    </section>
  );
};
