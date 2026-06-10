import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { teamWhatsAppHref } from '@/lib/contact';

// ─── Data ─────────────────────────────────────────────────────────────────

interface Category {
  emoji:       string;
  label:       string;
  slug:        string;
  hint:        string;
  description: string;
  popular?:    boolean;
}

const CATEGORIES: Category[] = [
  {
    emoji: '🛒', label: 'Shopping',  slug: 'shopping',
    hint: 'Any store · delivered to your door',
    description: 'We shop any store, follow your list, and deliver to your door.',
  },
  {
    emoji: '🐕', label: 'Dog walk',  slug: 'dog-walk',
    hint: 'On-lead · collected & returned safely',
    description: 'Collected from your door, walked on-lead, returned home safely.',
  },
  {
    emoji: '🌿', label: 'Garden',    slug: 'garden',
    hint: 'Mow, weed & tidy · waste bagged',
    description: 'Mowing, weeding, edging and tidying — all waste bagged.',
  },
  {
    emoji: '📦', label: 'Moving',    slug: 'moving',
    hint: 'Heavy lifting · you arrange the van',
    description: 'Loading, carrying, unloading — you arrange the van, we do the heavy lifting.',
  },
  {
    emoji: '🧹', label: 'Cleaning',  slug: 'cleaning',
    hint: 'Kitchen, bathroom, floors & surfaces',
    description: 'Hoovering, mopping, surfaces, kitchen and bathroom.',
    popular: true,
  },
  {
    emoji: '📚', label: 'Tutoring',  slug: 'tutoring',
    hint: 'One-to-one · any subject at home',
    description: 'One-to-one at your home. Any subject — Maths, science, languages.',
  },
];

// Smart defaults — most common booking for each service
const DEFAULT_SIZE: Record<string, string> = {
  shopping:  '',
  'dog-walk': '30 min',
  garden:    '2 hours',
  moving:    '2 hours',
  cleaning:  '2 hours',
  tutoring:  '1 hour',
};

// ─── Pricing ──────────────────────────────────────────────────────────────

function getPriceCents(slug: string, size: string): number | null {
  if (slug === 'shopping') return 1500;
  if (slug === 'dog-walk') return size === '30 min' ? 1500 : 2000;
  const map: Record<string, number> = {
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|3 hours': 5400,  'garden|4 hours': 7200,
    'garden|5 hours': 9000,  'garden|6 hours': 10800,  'garden|7 hours': 12600, 'garden|8 hours': 14400,
    'moving|1 hour': 1800,   'moving|2 hours': 3600,   'moving|3 hours': 5400,  'moving|4 hours': 7200,
    'moving|5 hours': 9000,  'moving|6 hours': 10800,  'moving|7 hours': 12600, 'moving|8 hours': 14400,
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200,  'cleaning|3 hours': 4800, 'cleaning|4 hours': 6400,
    'cleaning|5 hours': 8000, 'cleaning|6 hours': 9600, 'cleaning|7 hours': 11200, 'cleaning|8 hours': 12800,
    'tutoring|1 hour': 1500, 'tutoring|2 hours': 3000,  'tutoring|3 hours': 4500, 'tutoring|4 hours': 6000,
    'tutoring|5 hours': 7500, 'tutoring|6 hours': 9000, 'tutoring|7 hours': 10500, 'tutoring|8 hours': 12000,
  };
  return map[`${slug}|${size}`] ?? null;
}

function fmt(cents: number): string {
  return `€${(cents / 100).toFixed(0)}`;
}

// What to show on the card before tapping
function cardPrice(cat: Category): string {
  const defSize = DEFAULT_SIZE[cat.slug];
  const cents = getPriceCents(cat.slug, defSize);
  if (cents === null) return 'from €15';
  const price = fmt(cents);
  if (!defSize) return price;
  return `${price} · ${defSize}`;
}

// ─── Main grid ────────────────────────────────────────────────────────────
// Tapping a category opens the step-by-step booking flow at /book/:slug —
// the Uber-style wizard (details → when → confirm → pay).

export const CategoryGrid: React.FC = () => {
  const navigate = useNavigate();

  // Support the vano:select-category custom event from PricingTable etc.
  useEffect(() => {
    const handle = (e: Event) => {
      const slug = (e as CustomEvent<{ slug: string }>).detail.slug;
      if (CATEGORIES.some(c => c.slug === slug)) navigate(`/book/${slug}`);
    };
    window.addEventListener('vano:select-category', handle);
    return () => window.removeEventListener('vano:select-category', handle);
  }, [navigate]);

  return (
    <div id="category-grid" aria-label="What do you need help with?">
      <div className="grid grid-cols-3 gap-2.5">
        {CATEGORIES.map((cat, idx) => {
          const shown = cardPrice(cat);
          return (
            <motion.button
              key={cat.slug}
              onClick={() => navigate(`/book/${cat.slug}`)}
              whileHover={{ y: -3, scale: 1.04 }}
              whileTap={{ scale: 0.93 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1.5',
                'min-h-[96px] rounded-2xl px-2 py-3 border',
                'bg-white text-foreground hover:bg-secondary/60 border-border/60 hover:border-foreground/20 hover:shadow-sm',
                'transition-[background-color,border-color,box-shadow] duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              )}
            >
              {/* Pulse ring */}
              <span
                className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-foreground/10 animate-pulse"
                style={{ animationDelay: `${idx * 180}ms`, animationDuration: '3s' }}
                aria-hidden="true"
              />
              {/* Popular badge */}
              {cat.popular && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap z-10">
                  Popular
                </span>
              )}
              <span className="text-2xl leading-none select-none" aria-hidden="true">{cat.emoji}</span>
              <span className="text-[13px] font-semibold leading-tight text-center">{cat.label}</span>
              {/* Smart default price — the key info before you tap */}
              <span className="text-[11px] font-medium text-foreground/50 leading-tight tabular-nums">{shown}</span>
            </motion.button>
          );
        })}
      </div>

      {/* WhatsApp fallback */}
      <button
        onClick={() => window.open(`${teamWhatsAppHref}?text=${encodeURIComponent('Hi VANO! I need help with something — ')}`, '_blank', 'noopener,noreferrer')}
        className="mt-3.5 w-full rounded-2xl bg-[#25D366]/8 border border-[#25D366]/25 px-4 py-3.5 flex items-center gap-3.5 hover:bg-[#25D366]/12 active:scale-[0.98] transition-[background-color,transform] duration-150"
      >
        <span className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center flex-shrink-0">
          <MessageCircle className="w-3.5 h-3.5 text-white" aria-hidden="true" />
        </span>
        <span className="flex-1 text-left">
          <span className="block text-sm font-semibold text-foreground">Need something else?</span>
          <span className="block text-xs text-muted-foreground mt-0.5">Chat to us on WhatsApp — we'll sort it</span>
        </span>
        <span className="text-[#25D366] text-lg font-bold leading-none">→</span>
      </button>
    </div>
  );
};
