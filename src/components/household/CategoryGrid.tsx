import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Category {
  emoji: string;
  label: string;
  slug: string;
}

const CATEGORIES: Category[] = [
  { emoji: '🛒', label: 'Shopping',  slug: 'shopping'  },
  { emoji: '🐕', label: 'Dog walk',  slug: 'dog-walk'  },
  { emoji: '🌿', label: 'Garden',    slug: 'garden'    },
  { emoji: '📦', label: 'Moving',    slug: 'moving'    },
  { emoji: '🧹', label: 'Cleaning',  slug: 'cleaning'  },
  { emoji: '✨', label: 'Other',     slug: 'other'     },
];

/* Primary CTA — large Uber-style tiles. One tap, immediate navigation.
   Emoji is the visual anchor; label below for clarity.
   active:scale-[0.97] gives the tactile press feedback the design guide requires. */
export const CategoryGrid: React.FC = () => {
  const navigate = useNavigate();
  const [pressed, setPressed] = useState<string | null>(null);

  const handleSelect = (slug: string) => {
    setPressed(slug);
    setTimeout(() => navigate(`/book/${slug}`), 150);
  };

  return (
    <section id="category-grid" aria-label="What do you need help with?">
      <p className="text-sm font-semibold text-muted-foreground mb-4 tracking-wide uppercase" style={{ letterSpacing: '0.06em' }}>
        What do you need?
      </p>

      <div className="grid grid-cols-3 gap-2.5">
        {CATEGORIES.map(({ emoji, label, slug }) => (
          <button
            key={slug}
            onClick={() => handleSelect(slug)}
            className={cn(
              // Base — tall enough for a thumb, generous padding
              'relative flex flex-col items-center justify-center gap-1.5',
              'min-h-[88px] rounded-2xl',
              'transition-[background-color,transform,box-shadow] duration-150 ease-out-expo',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              'active:scale-[0.95]',
              pressed === slug
                ? 'bg-primary text-primary-foreground shadow-primary-glow scale-[0.97]'
                : 'bg-secondary/70 text-foreground hover:bg-secondary border border-border/40',
            )}
            aria-label={label}
          >
            <span className="text-2xl leading-none select-none" aria-hidden="true">
              {emoji}
            </span>
            <span className="text-[13px] font-medium leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
