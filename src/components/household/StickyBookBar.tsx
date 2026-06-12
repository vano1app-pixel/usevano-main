import React from 'react';
import { Button } from '@/components/ui/button';
import { useHelperCount } from '@/hooks/useHelperCount';

function scrollToGrid(): void {
  const el = document.getElementById('category-grid');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Mobile-only fixed bar. On md+ the CategoryGrid is always in view so this
   is redundant for desktop. safe-area-bottom handles iOS home indicator notch. */
export const StickyBookBar: React.FC = () => {
  const helperCount = useHelperCount();

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom"
      role="complementary"
      aria-label="Quick booking"
    >
      <div className="border-t border-border/60 bg-background/96 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="leading-tight">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" aria-hidden="true" />
            <p className="text-xs text-emerald-700 font-semibold">
              {helperCount > 0 ? `${helperCount} helpers online` : 'Helpers available now'}
            </p>
          </div>
          <p className="font-semibold text-foreground text-sm">From €15 · book in 30 sec</p>
        </div>
        <Button
          onClick={scrollToGrid}
          className="rounded-full px-7 font-semibold flex-shrink-0 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
          size="default"
        >
          Get help today
        </Button>
      </div>
    </div>
  );
};
