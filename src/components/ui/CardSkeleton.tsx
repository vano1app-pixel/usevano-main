import * as React from 'react';

import { cn } from '@/lib/utils';
import { cardBase } from '@/lib/cardStyles';

// Shared skeleton placeholder for freelancer-card-style lists. Before
// this, every list page rolled its own — StudentsByCategory had a full
// banner + avatar + two bio lines, BrowseStudents had a compact strip
// with just a small banner + inline avatar + name. The two patterns
// were close enough to feel drifty but different enough that each
// render was hand-tuned.
//
// Two variants cover the actual usage:
//   - "full": banner + avatar-overlap + name + bio lines. The
//     talent-board card shape.
//   - "compact": small banner + horizontal avatar + name + sub. The
//     featured-strip shape on Landing + BrowseStudents.
//
// All width/height values match the existing StudentsByCategory and
// BrowseStudents skeletons line-for-line so the swap is visually
// identical — this is a name-and-reuse refactor, not a redesign.

export type CardSkeletonVariant = 'full' | 'compact';

interface CardSkeletonProps {
  variant?: CardSkeletonVariant;
  className?: string;
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ variant = 'full', className }) => {
  if (variant === 'compact') {
    return (
      <div className={cn(cardBase, 'overflow-hidden', className)}>
        <div className="h-20 w-full animate-pulse bg-gradient-to-br from-muted via-muted/70 to-muted/50" />
        <div className="flex items-center gap-3 p-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted/70" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted/70" />
            <div className="h-2 w-1/3 animate-pulse rounded-full bg-muted/50" />
          </div>
        </div>
      </div>
    );
  }

  // Full variant — matches the StudentsByCategory talent-board card.
  return (
    <div className={cn(cardBase, 'overflow-hidden animate-pulse', className)}>
      <div className="h-48 w-full bg-muted/60" />
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-32 rounded-md bg-muted" />
            <div className="h-2.5 w-24 rounded-md bg-muted" />
          </div>
        </div>
        <div className="h-3 w-full rounded-md bg-muted" />
        <div className="h-3 w-4/5 rounded-md bg-muted" />
      </div>
    </div>
  );
};

interface CardSkeletonListProps extends CardSkeletonProps {
  count?: number;
  /** Accessibility label for the busy region. */
  label?: string;
  /** Layout of the skeleton list — "stack" for vertical, "row" for horizontal strip. */
  layout?: 'stack' | 'row';
}

export const CardSkeletonList: React.FC<CardSkeletonListProps> = ({
  count = 3,
  variant = 'full',
  label = 'Loading',
  layout = 'stack',
  className,
}) => {
  return (
    <div
      className={cn(
        layout === 'row' ? 'flex gap-3 overflow-hidden' : 'flex flex-col gap-4',
        className,
      )}
      aria-busy
      aria-label={label}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton
          key={i}
          variant={variant}
          className={layout === 'row' ? 'w-48 shrink-0 sm:w-56 md:w-64' : undefined}
        />
      ))}
    </div>
  );
};
