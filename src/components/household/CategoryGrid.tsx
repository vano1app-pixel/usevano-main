import React from 'react';
import { cn } from '@/lib/utils';

// ─── Replace with your real WhatsApp number (digits only, no + or spaces) ───
const WHATSAPP_NUMBER = '353899817111';

interface Category {
  label:   string;
  slug:    string;
  price:   string;
  message: string;
}

const CATEGORIES: Category[] = [
  {
    label:   'Shopping',
    slug:    'shopping',
    price:   'from €12',
    message: 'Hi VANO! I need a shopping run in Galway.',
  },
  {
    label:   'Dog walk',
    slug:    'dog-walk',
    price:   'from €10',
    message: 'Hi VANO! I need help walking my dog in Galway.',
  },
  {
    label:   'Garden',
    slug:    'garden',
    price:   'from €18/hr',
    message: 'Hi VANO! I need garden help in Galway.',
  },
  {
    label:   'Moving',
    slug:    'moving',
    price:   'from €18/hr',
    message: 'Hi VANO! I need moving help in Galway.',
  },
  {
    label:   'Cleaning',
    slug:    'cleaning',
    price:   'from €16/hr',
    message: 'Hi VANO! I need cleaning help in Galway.',
  },
  {
    label:   'Other',
    slug:    'other',
    price:   'from €12',
    message: 'Hi VANO! I need help with something in Galway — ',
  },
];

function openWhatsApp(message: string): void {
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const CategoryGrid: React.FC = () => {
  return (
    <section id="category-grid" aria-label="What do you need help with?">
      <p
        className="text-sm font-semibold text-muted-foreground mb-4 tracking-wide uppercase"
        style={{ letterSpacing: '0.06em' }}
      >
        What do you need?
      </p>

      <div className="grid grid-cols-3 gap-2.5">
        {CATEGORIES.map(({ label, slug, price, message }) => (
          <button
            key={slug}
            onClick={() => openWhatsApp(message)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1',
              'min-h-[88px] rounded-2xl px-2',
              'bg-secondary/70 text-foreground hover:bg-secondary border border-border/40',
              'transition-[background-color,transform] duration-150 ease-out-expo',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              'active:scale-[0.95] active:bg-primary active:text-primary-foreground active:border-primary',
            )}
            aria-label={`Book ${label}`}
          >
            <span className="text-sm font-semibold leading-tight">{label}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">{price}</span>
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Something else?{' '}
        <button
          onClick={() => openWhatsApp('Hi VANO! I need help with something in Galway — ')}
          className="underline underline-offset-2 text-foreground/60 hover:text-foreground transition-colors"
        >
          Tell us what you need
        </button>
      </p>
    </section>
  );
};
