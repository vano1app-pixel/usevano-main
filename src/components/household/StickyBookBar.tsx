import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
  // Hidden at the very top — the booking card is right there. Slides up once the
  // visitor scrolls past the hero so the CTA stays one tap away.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 340);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.div
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom"
      role="complementary"
      aria-label="Quick booking"
      initial={{ y: '110%' }}
      animate={{ y: shown ? 0 : '110%' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
    >
      <div className="border-t border-border/60 bg-background/96 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-4">
        <div className="leading-tight">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" aria-hidden="true" />
            <p className="text-xs text-emerald-700 font-semibold">
              {helperCount > 0 ? `${helperCount} helpers online` : 'Helpers available now'}
            </p>
          </div>
          <p className="font-semibold text-foreground text-sm">Book vetted help today</p>
        </div>
        <Button
          onClick={scrollToGrid}
          className="rounded-full px-7 font-semibold flex-shrink-0 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
          size="default"
        >
          Book now
        </Button>
      </div>
    </motion.div>
  );
};
