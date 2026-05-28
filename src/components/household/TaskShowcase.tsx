import React from 'react';
import { cn } from '@/lib/utils';

const GROUPS = [
  {
    heading: 'Around the house',
    tasks: [
      { emoji: '🧹', label: 'Outdoor cleaning', slug: 'cleaning' },
      { emoji: '📦', label: 'Moving help',       slug: 'moving'   },
      { emoji: '🔧', label: 'Furniture assembly', slug: 'other'   },
      { emoji: '📱', label: 'Tech help for elderly', slug: 'other' },
    ],
  },
  {
    heading: 'Garden & outdoors',
    tasks: [
      { emoji: '🌿', label: 'Lawn mowing',       slug: 'garden' },
      { emoji: '🌱', label: 'Weeding & pruning', slug: 'garden' },
      { emoji: '🍂', label: 'Leaf clearing',     slug: 'garden' },
      { emoji: '🪣', label: 'Pressure washing',  slug: 'garden' },
    ],
  },
  {
    heading: 'Errands',
    tasks: [
      { emoji: '🛒', label: 'Grocery shopping', slug: 'shopping'  },
      { emoji: '💊', label: 'Pharmacy runs',    slug: 'shopping'  },
      { emoji: '📬', label: 'Post office runs', slug: 'other'     },
      { emoji: '🐕', label: 'Dog walking',      slug: 'dog-walk'  },
    ],
  },
];

function selectCategory(slug: string) {
  const grid = document.getElementById('category-grid');
  if (grid) {
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.dispatchEvent(new CustomEvent('vano:select-category', { detail: { slug } }));
}

export const TaskShowcase: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-5xl mx-auto">
      <p className="eyebrow mb-3">Full list</p>
      <h2 className="text-2xl font-semibold text-foreground mb-8">
        What can your helper do?
      </h2>

      <div className="space-y-8">
        {GROUPS.map(({ heading, tasks }) => (
          <div key={heading}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {heading}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {tasks.map(({ emoji, label, slug }) => (
                <button
                  key={label}
                  onClick={() => selectCategory(slug)}
                  className={cn(
                    'bg-secondary/50 rounded-xl p-3 flex items-center gap-2.5 text-left',
                    'transition-[background-color,transform] duration-150',
                    'hover:bg-secondary active:scale-[0.97]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  )}
                >
                  <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">
                    {emoji}
                  </span>
                  <span className="text-sm font-medium text-foreground/80 leading-tight">
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
