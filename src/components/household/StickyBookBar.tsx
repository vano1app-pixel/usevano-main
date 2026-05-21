import React from 'react';
import { Button } from '@/components/ui/button';

/* Mobile-only fixed bar. On md+ the CategoryGrid is always in view so this
   is redundant for desktop. safe-area-bottom handles iOS home indicator notch. */
export const StickyBookBar: React.FC = () => {
  const scrollToCategories = () => {
    const el = document.getElementById('category-grid');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom"
      role="complementary"
      aria-label="Quick booking"
    >
      {/* Blur + border instead of heavy shadow — feels lighter */}
      <div className="border-t border-border/60 bg-background/96 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="leading-tight">
          <p className="font-semibold text-foreground text-sm">From €12</p>
          <p className="text-muted-foreground text-xs">Only charged when done</p>
        </div>
        <Button
          onClick={scrollToCategories}
          className="rounded-full px-7 font-semibold flex-shrink-0"
          size="default"
        >
          Book now
        </Button>
      </div>
    </div>
  );
};
