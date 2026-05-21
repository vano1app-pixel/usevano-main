import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface Category {
  emoji: string;
  label: string;
  slug: string;
}

const CATEGORIES: Category[] = [
  { emoji: '🛒', label: 'Shopping',   slug: 'shopping'  },
  { emoji: '🐕', label: 'Dog Walk',   slug: 'dog-walk'  },
  { emoji: '🌿', label: 'Garden',     slug: 'garden'    },
  { emoji: '📦', label: 'Moving',     slug: 'moving'    },
  { emoji: '🧹', label: 'Cleaning',   slug: 'cleaning'  },
  { emoji: '✨', label: 'Other',      slug: 'other'     },
];

export const CategoryGrid: React.FC = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState<string | null>(null);

  const handleSelect = (slug: string) => {
    setActive(slug);
    // Brief visual feedback before navigation so the user sees the selection
    setTimeout(() => navigate(`/book/${slug}`), 120);
  };

  return (
    <section id="category-grid" className="w-full">
      <p className="eyebrow mb-4">What do you need help with?</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {CATEGORIES.map(({ emoji, label, slug }) => (
          <button
            key={slug}
            onClick={() => handleSelect(slug)}
            className={cn(
              'flex items-center gap-3 min-h-[52px] px-4 rounded-3xl font-medium text-sm text-left',
              'transition-all duration-150 ease-out-expo',
              'active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              active === slug
                ? 'bg-primary text-primary-foreground shadow-primary-glow'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            <span className="text-xl leading-none" aria-hidden="true">{emoji}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
