import * as React from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

// One shared empty-state shell. Before this, every list page rolled
// its own "nothing here yet" card — some used dashed borders, some
// didn't; some had illustrations, some had plain text; action
// buttons appeared in three different sizes. The cumulative effect
// was that the app felt like a patchwork any time a user hit a
// zero-results state.
//
// Props cover the real usage pattern:
//   - icon: a lucide icon (rendered inside a soft-tinted rounded
//     square so the empty state has something to anchor the eye)
//   - title: one short line — the state name, not an instruction
//   - description: optional one or two sentences explaining what
//     would fill this space, with a CTA if there's one obvious
//     next action
//   - action: optional { label, onClick, variant } — rendered as a
//     primary button below the text
//   - secondaryAction: optional second button, outline-styled, for
//     pages that serve two audiences (e.g. StudentsByCategory's
//     "list yourself" + "try AI Find" empty state)
//   - size: "compact" fits inline inside a filtered list (e.g.
//     "no results at this rate"); "default" is the full-page feel
//   - tone: "default" = neutral dashed border; "success" = emerald
//     tint for "all clear" (e.g. "No active disputes")

export type EmptyStateTone = 'default' | 'success';
export type EmptyStateSize = 'default' | 'compact';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'outline';
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  size?: EmptyStateSize;
  tone?: EmptyStateTone;
  className?: string;
}

const toneContainer: Record<EmptyStateTone, string> = {
  default: 'border-dashed border-foreground/15 bg-muted/30',
  success: 'border-dashed border-emerald-500/25 bg-emerald-500/[0.04]',
};

const toneIconBg: Record<EmptyStateTone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

const sizePadding: Record<EmptyStateSize, string> = {
  default: 'px-6 py-12',
  compact: 'px-6 py-10',
};

const sizeIconBox: Record<EmptyStateSize, string> = {
  default: 'h-12 w-12',
  compact: 'h-10 w-10',
};

const sizeIcon: Record<EmptyStateSize, number> = {
  default: 20,
  compact: 18,
};

function ActionButton({ action, variant }: { action: EmptyStateAction; variant: 'primary' | 'outline' }) {
  const base = 'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition';
  const tone = variant === 'outline'
    ? 'border border-border bg-card text-foreground hover:bg-muted'
    : 'bg-primary text-primary-foreground hover:brightness-110';
  return (
    <button type="button" onClick={action.onClick} className={cn(base, tone)}>
      {action.label}
    </button>
  );
}

export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, description, action, secondaryAction, size = 'default', tone = 'default', className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col items-center gap-3 rounded-2xl border text-center',
          toneContainer[tone],
          sizePadding[size],
          className,
        )}
      >
        {Icon && (
          <div className={cn('flex items-center justify-center rounded-full', sizeIconBox[size], toneIconBg[tone])}>
            <Icon size={sizeIcon[size]} strokeWidth={2} />
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description && (
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {(action || secondaryAction) && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {action && <ActionButton action={action} variant={action.variant ?? 'primary'} />}
            {secondaryAction && <ActionButton action={secondaryAction} variant={secondaryAction.variant ?? 'outline'} />}
          </div>
        )}
      </div>
    );
  },
);
EmptyState.displayName = 'EmptyState';
