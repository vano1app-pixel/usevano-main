import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const GROUPS = [
  {
    heading: 'Around the house',
    tasks: [
      { emoji: '🧹', label: 'Outdoor cleaning',    slug: 'cleaning' },
      { emoji: '📦', label: 'Moving help',          slug: 'moving'   },
      { emoji: '🔧', label: 'Furniture assembly',   slug: 'other'    },
      { emoji: '📱', label: 'Tech help for elderly', slug: 'other'   },
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
      { emoji: '🛒', label: 'Grocery shopping', slug: 'shopping' },
      { emoji: '💊', label: 'Pharmacy runs',    slug: 'shopping' },
      { emoji: '📬', label: 'Post office runs', slug: 'other'    },
      { emoji: '🐕', label: 'Dog walking',      slug: 'dog-walk' },
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

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const card = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] } },
};

export const TaskShowcase: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-5xl mx-auto">
      <p className="eyebrow mb-3">Full list</p>
      <h2
        className="text-2xl font-semibold text-foreground mb-8"
        style={{ letterSpacing: '-0.02em' }}
      >
        What can your helper do?
      </h2>

      <div className="space-y-8">
        {GROUPS.map(({ heading, tasks }) => (
          <div key={heading}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              {heading}
            </p>
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-4 gap-2.5"
              variants={container}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: '-48px' }}
            >
              {tasks.map(({ emoji, label, slug }) => (
                <motion.button
                  key={label}
                  variants={card}
                  onClick={() => selectCategory(slug)}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-xl p-3 text-left',
                    'border border-border/40 bg-secondary/50',
                    'transition-[background-color,border-color,box-shadow,transform]',
                    'duration-200 ease-out-expo',
                    'hover:bg-primary/[0.04] hover:border-primary/20 hover:shadow-tinted-sm',
                    'active:scale-[0.97]',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  )}
                >
                  <span
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-background shadow-tinted-sm text-lg leading-none"
                    aria-hidden="true"
                  >
                    {emoji}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground/80 leading-tight">
                    {label}
                  </span>
                  <ChevronRight
                    className={cn(
                      'flex-shrink-0 w-3.5 h-3.5 text-primary/50',
                      'opacity-0 -translate-x-1',
                      'group-hover:opacity-100 group-hover:translate-x-0',
                      'transition-[opacity,transform] duration-200 ease-out-expo',
                    )}
                    strokeWidth={1.75}
                  />
                </motion.button>
              ))}
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
};
