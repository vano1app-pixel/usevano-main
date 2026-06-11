// Customer-facing pricing for household quick-book.
//
// The server (create-household-payment-checkout) is the source of truth for
// the job price AND adds a 5% service fee as a second Stripe line item.
// Every cent here must match the server's computePriceCents — the number on
// the "Book" button has to be the number on the customer's card statement.
// householdPricing.test.ts cross-checks both sides; if you change a price,
// change it in the edge function too.

export const SERVICE_FEE_PCT = 0.05; // keep in sync with the edge function

export function serviceFeeCents(baseCents: number): number {
  return Math.round(baseCents * SERVICE_FEE_PCT);
}

export function totalWithFeeCents(baseCents: number): number {
  return baseCents + serviceFeeCents(baseCents);
}

/** €32 for whole euros, €33.60 otherwise. */
export function fmtEuro(cents: number): string {
  return cents % 100 === 0 ? `€${cents / 100}` : `€${(cents / 100).toFixed(2)}`;
}

// ─── Quick-book categories (hero CategoryGrid) ────────────────────────────

export interface QuickBookCategory {
  emoji:       string;
  label:       string;
  slug:        string;
  hint:        string;
  description: string;
  popular?:    boolean;
  sizes?:      string[];
  sizeLabel?:  string;
}

export const QUICK_BOOK_CATEGORIES: QuickBookCategory[] = [
  {
    emoji: '🛒', label: 'Shopping',  slug: 'shopping',
    hint: 'Any store · delivered to your door',
    description: 'We shop any store, follow your list, and deliver to your door.',
  },
  {
    emoji: '🐕', label: 'Dog walk',  slug: 'dog-walk',
    hint: 'On-lead · collected & returned safely',
    description: 'Collected from your door, walked on-lead, returned home safely.',
    sizeLabel: 'How long?', sizes: ['30 min', '1 hour'],
  },
  {
    emoji: '🌿', label: 'Garden',    slug: 'garden',
    hint: 'Mow, weed & tidy · waste bagged',
    description: 'Mowing, weeding, edging and tidying — all waste bagged.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  },
  {
    emoji: '📦', label: 'Moving',    slug: 'moving',
    hint: 'Heavy lifting · you arrange the van',
    description: 'Loading, carrying, unloading — you arrange the van, we do the heavy lifting.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4+ hours'],
  },
  {
    emoji: '🧹', label: 'Cleaning',  slug: 'cleaning',
    hint: 'Kitchen, bathroom, floors & surfaces',
    description: 'Hoovering, mopping, surfaces, kitchen and bathroom.',
    popular: true,
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours'],
  },
  {
    emoji: '📚', label: 'Tutoring',  slug: 'tutoring',
    hint: 'One-to-one · any subject at home',
    description: 'One-to-one at your home. Any subject — Maths, science, languages.',
    sizeLabel: 'How long?', sizes: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  },
];

// Smart defaults — most common booking for each service
export const QUICK_BOOK_DEFAULT_SIZE: Record<string, string> = {
  shopping:  '',
  'dog-walk': '30 min',
  garden:    '2 hours',
  moving:    '2 hours',
  cleaning:  '2 hours',
  tutoring:  '1 hour',
};

export function quickBookPriceCents(slug: string, size: string): number | null {
  if (slug === 'shopping') return 1500;
  if (slug === 'dog-walk') return size === '30 min' ? 1500 : 2000;
  const map: Record<string, number> = {
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|3 hours': 5400,  'garden|4 hours': 7200,
    'garden|5 hours': 9000,  'garden|6 hours': 10800,  'garden|7 hours': 12600, 'garden|8 hours': 14400,
    'moving|1 hour': 1800,   'moving|2 hours': 3600,   'moving|3 hours': 5400,  'moving|4 hours': 7200,
    'moving|4+ hours': 7200, // sheet offers '4+ hours' — priced as 4h, same as the server
    'moving|5 hours': 9000,  'moving|6 hours': 10800,  'moving|7 hours': 12600, 'moving|8 hours': 14400,
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200,  'cleaning|3 hours': 4800, 'cleaning|4 hours': 6400,
    'cleaning|5 hours': 8000, 'cleaning|6 hours': 9600, 'cleaning|7 hours': 11200, 'cleaning|8 hours': 12800,
    'tutoring|1 hour': 1500, 'tutoring|2 hours': 3000,  'tutoring|3 hours': 4500, 'tutoring|4 hours': 6000,
    'tutoring|5 hours': 7500, 'tutoring|6 hours': 9000, 'tutoring|7 hours': 10500, 'tutoring|8 hours': 12000,
  };
  return map[`${slug}|${size}`] ?? null;
}
