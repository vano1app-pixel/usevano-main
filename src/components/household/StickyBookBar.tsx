import React from 'react';
import { Button } from '@/components/ui/button';
import { teamWhatsAppHref } from '@/lib/contact';

function openWhatsApp(): void {
  const url = `${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need some help — can you tell me more?')}`;
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
        <p className="text-muted-foreground text-xs">Galway · vetted students</p>
      </div>
      <Button
        onClick={openWhatsApp}
        className="rounded-full px-7 font-semibold flex-shrink-0 hover:-translate-y-px hover:shadow-primary-glow transition-[transform,box-shadow] duration-150"
        size="default"
      >
        Text us now
      </Button>
    </div>
  </div>
);
