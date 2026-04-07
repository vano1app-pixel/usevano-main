import React from 'react';
import { cn } from '@/lib/utils';

// Rotating palette of coloured pill styles — deterministic per tag string.
// Each entry: bg, text, ring (all standard Tailwind colours, no config changes needed).
const PILL_PALETTE = [
  'bg-blue-50 text-blue-700 ring-blue-200/60 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800/40',
  'bg-violet-50 text-violet-700 ring-violet-200/60 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800/40',
  'bg-emerald-50 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/40',
  'bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/40',
  'bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/40',
  'bg-cyan-50 text-cyan-700 ring-cyan-200/60 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-800/40',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return PILL_PALETTE[hash % PILL_PALETTE.length];
}

interface TagBadgeProps {
  tag: string;
  selected?: boolean;
  onClick?: () => void;
  removable?: boolean;
  onRemove?: () => void;
}

export const TagBadge: React.FC<TagBadgeProps> = ({ tag, selected, onClick, removable, onRemove }) => {
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-medium ring-1 transition-all duration-150',
        onClick && 'cursor-pointer hover:shadow-sm active:scale-95',
        selected
          ? 'bg-primary/12 text-primary ring-primary/30'
          : tagColor(tag),
      )}
    >
      {tag}
      {removable && onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 opacity-60 hover:opacity-100 hover:text-destructive transition-all duration-150"
        >
          ×
        </button>
      )}
    </span>
  );
};
