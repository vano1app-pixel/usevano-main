import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { CategoryGrid } from './CategoryGrid';
import { GeneralHelpField } from './GeneralHelpField';
import { ReferralWelcomeBanner } from './ReferralWelcomeBanner';
import { ReviewBadges } from './ReviewBadges';
import { HelperFacePile } from './HelperFacePile';
import { ScrollCue } from './ScrollCue';
import { SocialLinks } from './SocialLinks';
import { teamWhatsAppHref } from '@/lib/contact';
import { track } from '@/lib/track';
import { isNativeApp } from '@/lib/platform';

/**
 * Hero = one idea: you don't have to pick a job. The house is a bit much, so
 * you say what's going on (or nothing) and a local student comes for a couple
 * of hours. The "Send someone" general-help field is the front door and the
 * only loud button; the six category tiles sit BELOW it as the quieter "or
 * choose a specific job" path (CategoryGrid still owns the one booking sheet,
 * which the field opens by event). WhatsApp stays as the human door, quieter
 * than the primary action. Real approved-helper faces carry the trust.
 */

export const HeroSection: React.FC = () => {
  // The old "N helpers online" pill is GONE (owner call 2026-07-23: it ate
  // the trust row's space) — the review chips own that moment. The platform
  // numbers ("N students · N jobs booked") live ONLY in the lg+ nav now;
  // the phone hero dropped its copy the same day (it crowded the top).

  return (
    // LIGHT hero (July 2026): the paying customer is the 35+ Galway homeowner
    // — the Airbnb-light treatment (warm cream, big dark type, white cards)
    // reads "trusted home service", where the old navy band read "tech app".
    // Navy stays the anchor colour mid-page (podium, closing CTA, footer).
    // Top padding must CLEAR the fixed nav (72px pre-scroll): the hero is
    // justify-center, so whenever the stack outgrows the viewport (e.g. the
    // "book your usual" card is present on a laptop screen) the first row sits
    // AT the padding — at the old pt-14/16 that pinned the trust chips under
    // the nav bar (owner screenshot 2026-07-23).
    <section id="book" data-snap className="relative bg-cream px-4 pt-24 sm:pt-28 pb-[11vh] sm:pb-[10vh] flex flex-col justify-center min-h-[100svh]">
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

      <div className="relative mx-auto w-full max-w-5xl lg:max-w-6xl text-center">

        <div className="flex justify-center">
          <ReferralWelcomeBanner />
        </div>

        {/* Quiet location line — where + when, small and muted, above the
            headline so the first thing read is "near me, soon". */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-3 flex items-center justify-center gap-1.5 text-[12.5px] sm:text-sm font-medium text-foreground/55"
        >
          <MapPin className="h-3.5 w-3.5 text-sage" aria-hidden="true" />
          Same-day in Galway
        </motion.p>

        {/* Headline — the feeling, not a feature. A tired homeowner should read
            their own week in it. Bricolage display, tight tracking, big scale. */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="display-lg text-foreground text-balance tracking-tight text-[2rem] leading-[1.05] sm:text-5xl sm:leading-[1.02] lg:text-[3.9rem] mb-3 sm:mb-4"
        >
          The house is a bit much.
        </motion.h1>

        {/* One subline — states the whole promise: you don't brief a job, a
            named local student just comes and starts. */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="text-[15px] sm:text-lg text-foreground/70 text-balance max-w-xl mx-auto mb-7 sm:mb-8"
        >
          You don’t have to pick a job. A local student comes for a few hours and starts.
        </motion.p>

        {/* The front door — the "text a person" general-help field. It opens
            the existing booking sheet (custom, 2 hours) with these words
            prefilled; it carries its own amber halo as the focal point. */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <GeneralHelpField />
        </motion.div>

        {/* One quiet trust row under the action — Trustpilot + Google, not a
            stack of badges. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-5 flex flex-row flex-wrap items-center justify-center gap-2"
        >
          <ReviewBadges inline />
        </motion.div>

        {/* Real approved-helper faces — social proof right under the action. */}
        <HelperFacePile />

        {/* The tiles are GONE (owner call 2026-09-04: the bubble is the whole
            front door — you say what you want, we ask only what's missing).
            CategoryGrid stays mounted HEADLESS so it still owns the one booking
            sheet the bubble opens by event — no tiles rendered, no second
            pipeline. */}
        <CategoryGrid showTiles={false} />

        {/* The WhatsApp door — it converted real customers, so it earns a spot
            on the hero, quiet but visible. A person books it for you. Since
            2026-07-24 it's ALSO the odd-job catch-all (the "Anything else" and
            Business tiles are parked): a job the five tiles don't name still
            has an obvious human door on the first screen. */}
        {!isNativeApp() && (<>
        <motion.a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need a hand with ')}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('hero_whatsapp_tap')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-6 sm:mt-7 inline-flex items-center gap-1.5 text-[13px] sm:text-sm font-medium text-foreground/55 hover:text-[#128a45] transition-colors duration-150"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#25D366] flex-shrink-0" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.2 1.1-1.7 1.2-.4 0-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.2c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.3 1.4 2.6 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .1 0 .7-.2 1.4Z"/></svg>
          Rather text a person? WhatsApp us
        </motion.a>

        {/* Phone-only follow row — the nav carries these buttons from md up,
            but the phone bar has no room. Moved to the QUIET zone under the
            WhatsApp door (owner call 2026-07-23: at the top it pushed the
            headline down) — socials close the hero, they don't open it. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="md:hidden mt-4 flex items-center justify-center gap-2.5"
        >
          <span className="text-xs font-semibold tracking-wide text-foreground/55 whitespace-nowrap">Follow VANO</span>
          <SocialLinks variant="chip" className="flex" />
        </motion.div>
        </>)}
      </div>

      <ScrollCue tone="dark" delay={1.2} />
    </section>
  );
};
