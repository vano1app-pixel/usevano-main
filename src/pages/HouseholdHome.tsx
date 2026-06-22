import React, { useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ActivityTicker } from '@/components/household/ActivityTicker';
import { HowItWorks } from '@/components/household/HowItWorks';
import { HelperCards } from '@/components/household/HelperCards';
import { FAQSection } from '@/components/household/FAQSection';
import { FAQS } from '@/components/household/faqData';
import { HomePlans } from '@/components/household/HomePlans';
import { ReferralShareCard } from '@/components/household/ReferralShareCard';
import { FindBookingBar } from '@/components/household/FindBookingBar';
import { StickyBookBar } from '@/components/household/StickyBookBar';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { BlogTeaser } from '@/components/household/BlogTeaser';
import { ScrollCue } from '@/components/household/ScrollCue';
import { Reveal } from '@/components/Reveal';

/**
 * Two sections sell: the hero (book one job now) and House Autopilot
 * (never think about it again). Reviews and real helper faces sit
 * between them, so the bigger monthly ask only comes once trust is
 * built; FAQ and booking lookup follow.
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
        title="Same-day home help in Galway"
        description="Book a trusted local student helper in minutes — cleaning, garden, dog walks, groceries, moving & more. Same-day in Galway, from €15."
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
      <HouseholdNav darkHero />

      <main>
        <HeroSection />
        <ActivityTicker />
        {/* How it works (honest + simple), then real helper faces — so the
            bigger monthly ask below only comes once the visitor gets it. These
            two plus the hero are the full-screen snap sections (data-snap):
            each fills the viewport, gently snaps, and carries its own scroll
            cue that walks to the next section. `relative` anchors the cue. */}
        <div data-snap id="how" className="relative"><HowItWorks /><ScrollCue tone="dark" /></div>
        <div data-snap id="helpers" className="relative"><Reveal><HelperCards /></Reveal><ScrollCue tone="dark" /></div>
        {/* Flagship offer lands after trust; the navy band also anchors the
            middle of the page between the cream sections. NOT a snap target —
            it's taller than a screen (two builders + gift), so it scrolls
            normally rather than trapping anyone. NOT wrapped in Reveal — it
            contains the autopilot bottom sheet (position:fixed), which a
            transform ancestor would re-anchor. */}
        <HomePlans />
        <Reveal><FAQSection /></Reveal>
        <Reveal><FindBookingBar /></Reveal>
        {/* Self-hides unless this device has booked before (needs the phone) */}
        <Reveal>
          <section className="px-4 pb-20 bg-background">
            <div className="max-w-lg mx-auto">
              <ReferralShareCard />
            </div>
          </section>
        </Reveal>
        <Reveal><BlogTeaser /></Reveal>
        <HouseholdFooter />
      </main>

      <StickyBookBar />
    </div>
  );
};

export default HouseholdHome;
