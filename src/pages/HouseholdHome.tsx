import React, { useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ActivityTicker } from '@/components/household/ActivityTicker';
import { HowItWorks } from '@/components/household/HowItWorks';
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
        {/* How it works (honest + simple), then real helper faces — trust is
            established before the most-booked tiles ask for the tap. These
            two plus the hero are the full-screen snap sections (data-snap):
            each fills the viewport, gently snaps, and carries its own scroll
            cue that walks to the next section. `relative` anchors the cue. */}
        {/* Owner call (July 2026): the three-steps section is DESKTOP-ONLY —
            on phones it pushed the real helper faces too far down, so it's
            hidden there and the faces follow the hero directly. When the
            first real reviews land, ReviewCarousel (below, self-mounting)
            fills that trust slot on phones automatically. */}
        <div data-snap id="how" className="relative hidden sm:block"><HowItWorks /><ScrollCue tone="dark" /></div>
        <div data-snap id="helpers" className="relative"><Reveal><HelperCards /></Reveal><ScrollCue tone="dark" /></div>
        {/* Most-booked services as one-tap tiles — lands after trust; the navy
            band anchors the middle of the page between the cream sections. Tiles
            dispatch vano:select-category, which the hero's CategoryGrid catches
            to open the shared booking sheet. */}
        <PopularCategories />
        {/* ReviewCarousel now shows ONLY genuine household_ratings (the seed
            testimonials were deleted — fake reviews are a blacklisted
            commercial practice) and renders nothing until the first real
            review lands, so it's safe to keep mounted from day one. */}
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
