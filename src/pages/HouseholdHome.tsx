import React from 'react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ActivityTicker } from '@/components/household/ActivityTicker';
import { ReviewCarousel } from '@/components/household/ReviewCarousel';
import { HelperCards } from '@/components/household/HelperCards';
import { FAQSection } from '@/components/household/FAQSection';
import { FAQS } from '@/components/household/faqData';
import { HomePlans } from '@/components/household/HomePlans';
import { ReferralShareCard } from '@/components/household/ReferralShareCard';
import { FindBookingBar } from '@/components/household/FindBookingBar';
import { StickyBookBar } from '@/components/household/StickyBookBar';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';

/**
 * Two sections sell: the hero (book one job now) and House Autopilot
 * (never think about it again). Reviews and real helper faces sit
 * between them, so the bigger monthly ask only comes once trust is
 * built; FAQ and booking lookup follow.
 */
const HouseholdHome: React.FC = () => {
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
        {/* Trust first — social proof and real helper faces — so the bigger
            monthly ask below only comes once the visitor believes us */}
        <ReviewCarousel />
        <HelperCards />
        {/* Flagship offer lands after trust; the navy band also anchors the
            middle of the page between the cream sections */}
        <HomePlans />
        <FAQSection />
        <FindBookingBar />
        {/* Self-hides unless this device has booked before (needs the phone) */}
        <section className="px-4 pb-12 bg-background">
          <div className="max-w-lg mx-auto">
            <ReferralShareCard />
          </div>
        </section>
        <HouseholdFooter />
      </main>

      <StickyBookBar />
    </div>
  );
};

export default HouseholdHome;
