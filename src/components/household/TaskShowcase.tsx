import React from 'react';

const GROUPS = [
  {
    heading: 'Around the house',
    tasks: [
      { emoji: '🧹', label: 'Outdoor cleaning' },
      { emoji: '📦', label: 'Moving help' },
      { emoji: '🔧', label: 'Furniture assembly' },
      { emoji: '📱', label: 'Tech help for elderly' },
    ],
  },
  {
    heading: 'Garden & outdoors',
    tasks: [
      { emoji: '🌿', label: 'Lawn mowing' },
      { emoji: '🌱', label: 'Weeding & pruning' },
      { emoji: '🍂', label: 'Leaf clearing' },
      { emoji: '🪣', label: 'Pressure washing' },
    ],
  },
  {
    heading: 'Errands',
    tasks: [
      { emoji: '🛒', label: 'Grocery shopping' },
      { emoji: '💊', label: 'Pharmacy runs' },
      { emoji: '📬', label: 'Post office runs' },
      { emoji: '🐕', label: 'Dog walking' },
    ],
  },
];

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
              {tasks.map(({ emoji, label }) => (
                <div
                  key={label}
                  className="bg-secondary/50 rounded-xl p-3 flex items-center gap-2.5 hover-lift transition-transform duration-150"
                >
                  <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">
                    {emoji}
                  </span>
                  <span className="text-sm font-medium text-foreground/80 leading-tight">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
