import React from 'react';
import { motion } from 'framer-motion';
import { useHelperCount } from '@/hooks/useHelperCount';
import { helperPresenceTier } from '@/lib/helperPresence';
import { useCountUp } from '@/hooks/useCountUp';
import { CategoryGrid } from './CategoryGrid';
import { ReferralWelcomeBanner } from './ReferralWelcomeBanner';
import { ReviewBadges } from './ReviewBadges';
import { HelperFacePile } from './HelperFacePile';
import { ScrollCue } from './ScrollCue';
import { teamWhatsAppHref } from '@/lib/contact';
import { track } from '@/lib/track';

/**
 * Hero = one job: get a tile tapped. Minimal + warm build — one calm
 * social-proof row (Trustpilot + live presence as matching glass chips), a warm
 * heading, the six tap tiles glowing at centre under an amber halo
 * (CategoryGrid renders them + the wizard booking sheet), one gentle
 * reassurance line, and the WhatsApp door beneath. Tap-ONLY because the first
 * real bookings came from tiles + WhatsApp — the search bar brought none, so
 * it's gone; "Anything else" opens the sheet's describe-it page instead.
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
    <section id="book" data-snap className="relative bg-navy px-4 pt-14 sm:pt-16 pb-[11vh] sm:pb-[16vh] flex flex-col justify-center min-h-[100svh]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" />
        {/* Soft seam (mobile only — desktop keeps the crisp edge for the
            ScrollCue): the navy hero melts down into the cream content that
            follows, so scrolling out of the hero isn't a hard colour cut. */}
        <div className="lg:hidden pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-cream" aria-hidden="true" />
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
          className="mb-3 sm:mb-10 flex flex-col items-center gap-2 sm:gap-2.5"
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

        {/* Heading — the mom test (one plain sentence that says WHAT this is
            and WHO comes; a stranger's mam should get it instantly). The
            signature gold underline draws under the differentiator. */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="display-lg text-white text-balance tracking-tight text-[1.75rem] leading-[1.08] sm:text-[2.75rem] sm:leading-[1.04] mb-2 sm:mb-3"
        >
          Hire a{' '}
          <span className="relative inline-block">
            local student
            <motion.span
              aria-hidden="true"
              className="absolute left-0 right-0 -bottom-1 h-[3px] rounded-full bg-gold/90 origin-left"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>{' '}
          for help at home.
        </motion.h1>

        {/* The specifics the heading doesn't carry — what jobs, where, when,
            from how much ("nobody ever buys without knowing the price"). */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-4 sm:mb-7 text-[13px] sm:text-base leading-relaxed text-white/70 text-pretty"
        >
          Cleaning, laundry, garden &amp; more — same-day in Galway, from €15.
        </motion.p>

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

        {/* Real approved-helper faces — social proof right under the bar. */}
        <HelperFacePile />

        {/* One gentle reassurance line — replaces the old subline + 4 chips. */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-3 sm:mt-6 max-w-md mx-auto text-[13px] sm:text-sm leading-relaxed text-white/70 text-pretty"
        >
          You see them first
          <span className="text-white/35 px-1.5">·</span>
          pay when it's done
          <span className="text-white/35 px-1.5">·</span>
          money-back guarantee
        </motion.p>

        {/* The WhatsApp door — it converted real customers, so it earns a spot
            on the hero, quiet but visible. A person books it for you. */}
        <motion.a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need a hand with ')}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('hero_whatsapp_tap')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-2 sm:mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-2 text-[13px] font-semibold text-[#7fe0a5] hover:bg-[#25D366]/20 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current flex-shrink-0" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.2c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .1 0 .7-.2 1.4Z"/></svg>
          Or book on WhatsApp — a person sorts it in minutes
        </motion.a>
      </div>

      <ScrollCue tone="light" delay={1.2} />
    </section>
  );
};
