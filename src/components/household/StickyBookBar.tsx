import React from 'react';
import { Button } from '@/components/ui/button';

/* Mobile-only fixed bar at the bottom of the screen. Hidden at md: and above
   because desktop users have the CategoryGrid fully visible at all times.
   safe-area-bottom handles the iOS home indicator notch. */
export const StickyBookBar: React.FC = () => {
  const scrollToCategories = () => {
    const el = document.getElementById('category-grid');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Brief pulse to draw attention to the grid after scrolling
    el.classList.add('animate-pulse');
    setTimeout(() => el.classList.remove('animate-pulse'), 700);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-lg border-t border-border/50 shadow-tinted-xl safe-area-bottom"
      role="complementary"
      aria-label="Quick booking"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-semibold text-navy text-sm">From €12</p>
          <p className="text-muted-foreground text-xs">No charge until done</p>
        </div>
        <Button
          onClick={scrollToCategories}
          className="rounded-full px-6 font-medium shadow-primary-glow"
        >
          Book now
        </Button>
      </div>
    </div>
  );
};
