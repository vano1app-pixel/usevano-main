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
    // LIGHT hero (July 2026): the paying customer is the 35+ Galway homeowner
    // — the Airbnb-light treatment (warm cream, big dark type, white cards)
    // reads "trusted home service", where the old navy band read "tech app".
    // Navy stays the anchor colour mid-page (podium, closing CTA, footer).
    <section id="book" data-snap className="relative bg-cream px-4 pt-14 sm:pt-16 pb-[11vh] sm:pb-[10vh] flex flex-col justify-center min-h-[100svh]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="grain pointer-events-none absolute inset-0 opacity-[0.05]" aria-hidden="true" />
        <motion.div
          className="pointer-events-none absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.22) 0%, transparent 70%)' }}
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: [0.5, 0.75, 0.5], scale: [1, 1.08, 1] }}
          transition={{ duration: 9, ease: 'easeInOut', repeat: Infinity }}
          aria-hidden="true"
        />
        <motion.div
          className="pointer-events-none absolute -bottom-40 -right-32 w-[560px] h-[560px] rounded-full"
          style={{ background: 'radial-gradient(circle, hsl(119 23% 55% / 0.18) 0%, transparent 70%)' }}
          initial={{ opacity: 0.4, scale: 1.05 }}
          animate={{ opacity: [0.4, 0.6, 0.4], scale: [1.05, 1, 1.05] }}
          transition={{ duration: 11, ease: 'easeInOut', repeat: Infinity, delay: 1.5 }}
          aria-hidden="true"
        />
      </div>

      <div className="relative mx-auto w-full max-w-5xl text-center">

        <div className="flex justify-center">
          <ReferralWelcomeBanner />
        </div>

        {/* One centered row of trust chips — Trustpilot + the live "helpers
            online" count side by side (they used to stack; one line saves
            height so the whole hero fits a desktop viewport). */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-4 sm:mb-8 flex flex-row flex-wrap items-center justify-center gap-2"
        >
          <ReviewBadges inline />
          {!helperReady ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-border/70 px-3.5 py-2 sm:px-4 sm:py-2.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-foreground/15 flex-shrink-0" aria-hidden="true" />
              <span className="w-28 h-3.5 rounded-full bg-secondary relative overflow-hidden">
                <span className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-foreground/10 to-transparent" />
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-border/70 px-3.5 py-2 sm:px-4 sm:py-2.5 text-sm sm:text-[15px] font-medium text-foreground/90 shadow-sm">
              <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-50 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="tracking-wide whitespace-nowrap">{presenceLabel}</span>
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
          className="display-lg text-foreground text-balance tracking-tight text-[1.75rem] leading-[1.08] sm:text-5xl sm:leading-[1.05] lg:text-[3.4rem] mb-5 sm:mb-8"
        >
          Get help at home from a{' '}
          <span className="relative inline-block">
            trusted local student
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

        {/* Real approved-helper faces — social proof right under the bar. */}
        <HelperFacePile />

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
          className="mt-4 sm:mt-6 inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#25D366]/40 bg-[#25D366]/8 px-4 py-2 sm:px-5 sm:py-2.5 text-[13px] sm:text-[15px] font-semibold text-[#128a45] hover:bg-[#25D366]/15 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current flex-shrink-0" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.2c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .1 0 .7-.2 1.4Z"/></svg>
          Prefer to text? Book on WhatsApp — we sort it for you
        </motion.a>
      </div>

      <ScrollCue tone="dark" delay={1.2} />
    </section>
  );
};
