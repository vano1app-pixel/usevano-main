import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The bobbing "Scroll" cue that sits at the foot of each full-screen snap
 * section. Click (or Enter) walks to the next section: the next [data-snap]
 * in document order, or — on the last snap — whatever content follows it.
 * No explicit scroll behaviour is passed, so the global `scroll-behavior`
 * rule decides (smooth normally, instant under prefers-reduced-motion).
 *
 * Desktop only, matching the scroll-snap behaviour. `tone` flips the colour
 * for dark vs light section backgrounds.
 */
export const ScrollCue: React.FC<{ tone?: 'light' | 'dark'; delay?: number; label?: string }> = ({
  tone = 'dark',
  delay = 0,
  label = 'Scroll to the next section',
}) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const current = e.currentTarget.closest('[data-snap]');
    if (!current) return;
    const snaps = Array.from(document.querySelectorAll<HTMLElement>('[data-snap]'));
    const next =
      snaps[snaps.indexOf(current as HTMLElement) + 1] ?? (current.nextElementSibling as HTMLElement | null);
    next?.scrollIntoView({ block: 'start' });
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      aria-label={label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.8 }}
      className={cn(
        // On mobile the cue clears the fixed "Book" bar + iOS home indicator;
        // on md+ (no sticky bar) it drops to the usual bottom-6.
        'flex absolute bottom-[calc(5rem_+_env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 flex-col items-center gap-1 rounded-full px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2',
        tone === 'light'
          ? 'text-white/35 hover:text-white/75 focus-visible:ring-white/40'
          : 'text-foreground/30 hover:text-foreground/70 focus-visible:ring-foreground/30',
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">Scroll</span>
      <motion.span animate={{ y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}>
        <ChevronDown className="w-5 h-5" />
      </motion.span>
    </motion.button>
  );
};
