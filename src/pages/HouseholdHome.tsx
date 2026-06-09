import React from 'react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ActivityTicker } from '@/components/household/ActivityTicker';
import { ReviewCarousel } from '@/components/household/ReviewCarousel';
import { HelperCards } from '@/components/household/HelperCards';
import { TaskShowcase } from '@/components/household/TaskShowcase';
import { ChatFAQ } from '@/components/household/ChatFAQ';
import { ElderlyPitch } from '@/components/household/ElderlyPitch';
import { FindBookingBar } from '@/components/household/FindBookingBar';
import { StickyBookBar } from '@/components/household/StickyBookBar';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';

const HouseholdHome: React.FC = () => {
  return (
    // Cream warm-white base — distinguishes the household platform from the
    // pure-white marketplace and reads warmer/more trustworthy for in-home services
    <div className="-mt-14 lg:-mt-16 bg-cream">
      <SEOHead
        title="Same-day home help in Galway & Ireland"
        description="Book a trusted student helper in minutes. Grocery shopping, dog walking, garden, cleaning, moving help & more. Same-day service from €10. Available across Ireland."
        keywords="home help Galway, student helpers Ireland, grocery shopping Galway, dog walking Galway, cleaning service Galway, same day help Ireland, household help Cork Dublin Limerick, VANO"
        url="https://vanojobs.com/"
      />
      <HouseholdNav darkHero />

      <main>
        <HeroSection />
        <ActivityTicker />
        <ReviewCarousel />
        <HelperCards />
        <TaskShowcase />
<ChatFAQ />
        <ElderlyPitch />
        <FindBookingBar />
        <HouseholdFooter />
      </main>

      <StickyBookBar />
    </div>
  );
};

export default HouseholdHome;
