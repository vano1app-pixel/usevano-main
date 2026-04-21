import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

// Small pill-shaped label for conveying a status (live / pending /
// flagged / rating bucket / etc). Before this, every surface rolled
// its own — emerald-500/10 + text-emerald-700 + ring-emerald-500/20
// with subtle drift in paddings, sizes, and dark-mode overrides. The
// visual inconsistency was one of the clearest "feels unpolished"
// signals across the app.
//
// Tone covers the five semantic states we actually use; variant is
// 'soft' for resting states (most chips) and 'solid' for highlighted
// moments. Icon + dot are mutually exclusive in practice — dot reads
// as a static indicator, icon as a small glyph.

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type StatusVariant = 'soft' | 'solid';
export type StatusSize = 'sm' | 'md';

interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  variant?: StatusVariant;
  size?: StatusSize;
  icon?: LucideIcon;
  /** Renders a small filled circle before the label. Use instead of icon. */
  dot?: boolean;
}

/* Tailwind class maps. Hard-coded rather than template-stringed so the
 * JIT compiler actually sees them at build time — dynamic class names
 * don't survive Tailwind's purge. */
const softTone: Record<StatusTone, string> = {
  success: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300',
  warning: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive ring-1 ring-destructive/30',
  info: 'bg-primary/10 text-primary ring-1 ring-primary/25',
  neutral: 'bg-muted text-muted-foreground ring-1 ring-border',
};

const solidTone: Record<StatusTone, string> = {
  success: 'bg-emerald-500 text-white',
  warning: 'bg-amber-500 text-white',
  danger: 'bg-destructive text-destructive-foreground',
  info: 'bg-primary text-primary-foreground',
  neutral: 'bg-foreground text-background',
};

const dotTone: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-destructive',
  info: 'bg-primary',
  neutral: 'bg-muted-foreground',
};

const sizeClasses: Record<StatusSize, string> = {
  sm: 'px-2 py-0.5 text-[10.5px] gap-1',
  md: 'px-2.5 py-0.5 text-[11.5px] gap-1.5',
};

const iconSize: Record<StatusSize, number> = { sm: 10, md: 12 };
const dotSize: Record<StatusSize, string> = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2' };

export const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ tone = 'neutral', variant = 'soft', size = 'md', icon: Icon, dot, className, children, ...rest }, ref) => {
    const toneClass = variant === 'solid' ? solidTone[tone] : softTone[tone];
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full font-semibold uppercase tracking-[0.08em] whitespace-nowrap',
          sizeClasses[size],
          toneClass,
          className,
        )}
        {...rest}
      >
        {dot && <span className={cn('inline-block shrink-0 rounded-full', dotSize[size], dotTone[tone])} />}
        {Icon && <Icon size={iconSize[size]} strokeWidth={2.5} className="shrink-0" />}
        {children}
      </span>
    );
  },
);
StatusChip.displayName = 'StatusChip';
