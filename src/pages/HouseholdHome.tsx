import React, { useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ActivityTicker } from '@/components/household/ActivityTicker';
import { HelperCards } from '@/components/household/HelperCards';
import { FAQSection } from '@/components/household/FAQSection';
import { FAQS } from '@/components/household/faqData';
import { PopularCategories } from '@/components/household/PopularCategories';
import { ClosingCta } from '@/components/household/ClosingCta';
import { ReviewCarousel } from '@/components/household/ReviewCarousel';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { BlogTeaser } from '@/components/household/BlogTeaser';
import { ScrollCue } from '@/components/household/ScrollCue';
import { Reveal } from '@/components/Reveal';

/**
 * The hero search bar (type what you need) is the one front door. Real helper
 * faces and "how it works" build trust, then a band of the three most-booked
 * services gives a one-tap path for people who'd rather not type; FAQ and
 * booking lookup follow.
 */
const HouseholdHome: React.FC = () => {
  // Gentle section-snapping (CSS in index.css) is desktop-only and scoped to
  // this page — flag <html> while the home is mounted so it never leaks onto
  // other routes (dashboards, checkout, etc.).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('snap-home');
    return () => root.classList.remove('snap-home');
  }, []);

  return (
    // Cream warm-white base — distinguishes the household platform from the
    // pure-white marketplace and reads warmer/more trustworthy for in-home services
    <div className="bg-cream">
      <SEOHead
        title="Hire a local student for help at home — same-day in Galway"
        description="Hire a trusted local student for cleaning, garden, dog walks, laundry, moving & more. Same-day in Galway, from €15 — only charged when a helper accepts."
        keywords="home help Galway, cleaner Galway, dog walker Galway, garden help Galway, grocery delivery Galway, student helpers Galway, same day help Galway, VANO"
        url="https://vanojobs.com/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQS.map(f => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }}
      />
      {/* Light hero (July 2026) — the nav uses its standard light treatment. */}
      <HouseholdNav />

      <main>
        <HeroSection />
        <ActivityTicker />
        {/* Real helper faces right after the hero — trust is established
            before the most-booked tiles ask for the tap. Hero + faces are the
            full-screen snap sections (data-snap); each carries its own scroll
            cue. `relative` anchors the cue. */}
        <div data-snap id="helpers" className="relative"><Reveal><HelperCards /></Reveal><ScrollCue tone="dark" /></div>
        {/* Most-booked services as one-tap tiles — lands after trust; the navy
            band anchors the middle of the page between the cream sections. Tiles
            dispatch vano:select-category, which the hero's CategoryGrid catches
            to open the shared booking sheet. */}
        <PopularCategories />
        {/* The "Just 3 easy steps" section (HowItWorks) is UNMOUNTED — owner
            call 2026-07-24: not needed. The flow now explains itself where it
            happens (phone instruction line on the hero, promise chips + the
            babysitter money line inside the sheet), so a mid-page explainer
            was one more thing to scroll past. Component kept in the repo;
            nothing links #how. Don't remount without the owner. */}
        {/* ReviewCarousel shows ONLY genuine reviews (the seed testimonials
            were deleted — fake reviews are a blacklisted commercial practice)
            and renders nothing until the first real one lands, so it's safe
            to keep mounted from day one. It auto-ROTATES through them, each
            labeled with where it was left (VANO booking / Google /
            Trustpilot once those feeds exist). */}
        <Reveal><ReviewCarousel /></Reveal>
        <Reveal><FAQSection /></Reveal>
        {/* Closing CTA — the FAQ just answered the objections; give that
            reader a button instead of fading out into the blog + footer. */}
        <Reveal><ClosingCta /></Reveal>
        {/* The "Give €5, get €5" referral card lives on the Account tab and the
            post-booking tracking page now — not on the marketing home, where it
            sat awkwardly between sections. */}
        <Reveal><BlogTeaser /></Reveal>
        <HouseholdFooter />
      </main>
    </div>
  );
};

export default HouseholdHome;
