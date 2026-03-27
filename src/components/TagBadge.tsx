import React from 'react';
import { cn } from '@/lib/utils';

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
        'inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors',
        onClick && 'cursor-pointer',
        selected
          ? 'border-primary/40 bg-primary/12 text-primary'
          : 'border-foreground/10 bg-background text-foreground/70 hover:border-foreground/20 hover:text-foreground/90'
      )}
    >
      {tag}
      {removable && onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 opacity-60 hover:opacity-100 hover:text-destructive">
          ×
        </button>
      )}
    </span>
  );
};
