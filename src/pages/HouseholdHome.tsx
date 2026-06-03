import React from 'react';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ReviewCarousel } from '@/components/household/ReviewCarousel';
import { HowItWorks } from '@/components/household/HowItWorks';
import { HelperCards } from '@/components/household/HelperCards';
import { TaskShowcase } from '@/components/household/TaskShowcase';
import { PricingTable } from '@/components/household/PricingTable';
import { ChatFAQ } from '@/components/household/ChatFAQ';
import { ElderlyPitch } from '@/components/household/ElderlyPitch';
import { StickyBookBar } from '@/components/household/StickyBookBar';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';

/* /home — household help platform landing page.
   This route intentionally bypasses the marketplace Navbar and MobileBottomNav;
   HouseholdNav replaces both. The -mt-14 lg:-mt-16 wrapper corrects the global
   md:pt-14 lg:pt-16 offset that App.tsx applies to every route, since
   HouseholdNav is fixed and already offsets the hero internally (pt-24). */
const HouseholdHome: React.FC = () => {
  return (
    <div className="-mt-14 lg:-mt-16">
      <HouseholdNav />

      <main>
        <HeroSection />
        <ReviewCarousel />
        <HowItWorks />
        <HelperCards />
        <TaskShowcase />
        <PricingTable />
        <ChatFAQ />
        <ElderlyPitch />
        <HouseholdFooter />
      </main>

      {/* Only visible on mobile — stays above iOS home indicator */}
      <StickyBookBar />
    </div>
  );
};

export default HouseholdHome;
