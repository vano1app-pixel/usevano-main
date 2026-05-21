import React from 'react';

const TASKS = [
  { emoji: '🛒', label: 'Grocery shopping' },
  { emoji: '🐕', label: 'Dog walking' },
  { emoji: '🌿', label: 'Lawn mowing' },
  { emoji: '📦', label: 'Moving help' },
  { emoji: '🧹', label: 'Outdoor cleaning' },
  { emoji: '💊', label: 'Pharmacy runs' },
  { emoji: '📬', label: 'Post office runs' },
  { emoji: '🔧', label: 'Furniture assembly' },
  { emoji: '📱', label: 'Tech help for elderly' },
  { emoji: '📚', label: 'Tutoring & grinds' },
  { emoji: '📦', label: 'Wait for deliveries' },
  { emoji: '💬', label: 'Anything else' },
];

export const TaskShowcase: React.FC = () => {
  return (
    <section className="px-4 py-12 max-w-5xl mx-auto">
      <p className="eyebrow mb-3">Full list</p>
      <h2 className="text-2xl font-semibold text-foreground mb-6">
        What can your helper do?
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {TASKS.map(({ emoji, label }) => (
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
    </section>
  );
};
