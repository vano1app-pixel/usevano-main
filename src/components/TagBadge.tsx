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
        'inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors',
        onClick && 'cursor-pointer',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'bg-secondary text-secondary-foreground hover:bg-primary/10'
      )}
    >
      {tag}
      {removable && onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="ml-0.5 hover:text-destructive">
          ×
        </button>
      )}
    </span>
  );
};
