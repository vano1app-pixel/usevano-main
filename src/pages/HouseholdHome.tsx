import React from 'react';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HeroSection } from '@/components/household/HeroSection';
import { ActivityTicker } from '@/components/household/ActivityTicker';
import { ReviewCarousel } from '@/components/household/ReviewCarousel';
import { HelperCards } from '@/components/household/HelperCards';
import { TaskShowcase } from '@/components/household/TaskShowcase';
import { PricingTable } from '@/components/household/PricingTable';
import { ChatFAQ } from '@/components/household/ChatFAQ';
import { ElderlyPitch } from '@/components/household/ElderlyPitch';
import { StickyBookBar } from '@/components/household/StickyBookBar';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';

const HouseholdHome: React.FC = () => {
  return (
    // Cream warm-white base — distinguishes the household platform from the
    // pure-white marketplace and reads warmer/more trustworthy for in-home services
    <div className="-mt-14 lg:-mt-16 bg-cream">
      <HouseholdNav />

      <main>
        <HeroSection />
        <ActivityTicker />
        <ReviewCarousel />
        <HelperCards />
        <TaskShowcase />
        <PricingTable />
        <ChatFAQ />
        <ElderlyPitch />
        <HouseholdFooter />
      </main>

      <StickyBookBar />
    </div>
  );
};

export default HouseholdHome;
