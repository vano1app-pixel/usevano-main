import React from 'react';
import { Button } from '@/components/ui/button';

const WHATSAPP_NUMBER = '353899817111';

function openWhatsApp(): void {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi VANO! I need help in Galway.')}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/* Mobile-only fixed bar. On md+ the CategoryGrid is always in view so this
   is redundant for desktop. safe-area-bottom handles iOS home indicator notch. */
export const StickyBookBar: React.FC = () => (
  <div
    className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom"
    role="complementary"
    aria-label="Quick booking"
  >
    <div className="border-t border-border/60 bg-background/96 backdrop-blur-xl px-4 py-3 flex items-center justify-between gap-4">
      <div className="leading-tight">
        <p className="font-semibold text-foreground text-sm">From €12</p>
        <p className="text-muted-foreground text-xs">Galway · ATU students</p>
      </div>
      <Button
        onClick={openWhatsApp}
        className="rounded-full px-7 font-semibold flex-shrink-0"
        size="default"
      >
        Text us now
      </Button>
    </div>
  </div>
);
