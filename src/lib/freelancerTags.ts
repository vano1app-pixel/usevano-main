import type { CommunityCategoryId } from '@/lib/communityCategories';
import type { LucideIcon } from 'lucide-react';
import {
  Zap,
  Wallet,
  Award,
  Camera,
  Sparkles,
  Clock,
  Palette,
  ShieldCheck,
} from 'lucide-react';

// Click-first question sets that replace the old freeform pitch
// textareas. Storing as slugs (never the label copy) so the UI
// wording can evolve without orphaning rows. Kept small on purpose —
// five to eight options each — so the picker reads as "pick two"
// instead of a daunting chip grid the freelancer scrolls past.

export interface TagOption {
  id: string;
  label: string;
}

/** "Who do you work with?" — one multi-select per category. Pulls the
 *  wizard's Step 2 away from an open-ended "describe your clients"
 *  textarea toward three taps. Same answer for the AI ranker, zero
 *  typing for the freelancer. */
export const CLIENT_TYPES_BY_CATEGORY: Record<CommunityCategoryId, readonly TagOption[]> = {
  videography: [
    { id: 'couples', label: 'Couples' },
    { id: 'event_venues', label: 'Event venues' },
    { id: 'small_biz', label: 'Small businesses' },
    { id: 'artists_bands', label: 'Artists & bands' },
    { id: 'corporate', label: 'Corporate' },
    { id: 'individuals', label: 'Individuals' },
  ],
  websites: [
    { id: 'small_biz', label: 'Small businesses' },
    { id: 'startups', label: 'Startups' },
    { id: 'ecommerce', label: 'E-commerce' },
    { id: 'agencies', label: 'Agencies' },
    { id: 'solopreneurs', label: 'Solopreneurs' },
    { id: 'non_profits', label: 'Non-profits' },
  ],
  social_media: [
    { id: 'brands', label: 'Brands' },
    { id: 'creators', label: 'Creators' },
    { id: 'small_biz', label: 'Small businesses' },
    { id: 'agencies', label: 'Agencies' },
    { id: 'startups', label: 'Startups' },
    { id: 'restaurants', label: 'Restaurants & cafés' },
  ],
  digital_sales: [
    { id: 'startups', label: 'Startups' },
    { id: 'smbs', label: 'SMBs' },
    { id: 'agencies', label: 'Agencies' },
    { id: 'enterprise', label: 'Enterprise' },
    { id: 'ecommerce', label: 'E-commerce' },
    { id: 'saas', label: 'SaaS' },
  ],
};

/** "What sets you apart?" — universal across categories. Each slug
 *  carries a Lucide icon so the card can render them as visual
 *  chip-with-icon rows instead of plain text, which was the whole
 *  point of making Step 2 click-first in the first place. */
export interface StrengthOption extends TagOption {
  icon: LucideIcon;
}

export const STRENGTH_OPTIONS: readonly StrengthOption[] = [
  { id: 'fast_turnaround', label: 'Fast turnaround',   icon: Zap },
  { id: 'budget_friendly', label: 'Budget-friendly',    icon: Wallet },
  { id: 'very_experienced',label: 'Very experienced',   icon: Award },
  { id: 'own_gear',        label: 'Own gear',           icon: Camera },
  { id: 'creative_style',  label: 'Creative style',     icon: Palette },
  { id: 'flexible_hours',  label: 'Flexible hours',     icon: Clock },
  { id: 'reliable',        label: 'Reliable',           icon: ShieldCheck },
  { id: 'award_winning',   label: 'Award-winning',      icon: Sparkles },
];

const STRENGTH_LOOKUP: ReadonlyMap<string, StrengthOption> = new Map(
  STRENGTH_OPTIONS.map((opt) => [opt.id, opt]),
);

/** Resolves a strength slug to its option (label + icon) or null when
 *  the slug isn't recognised — used by the card renderer so deleted
 *  or renamed options silently drop instead of rendering broken chips. */
export function findStrength(slug: string | null | undefined): StrengthOption | null {
  if (!slug) return null;
  return STRENGTH_LOOKUP.get(slug) ?? null;
}

/** Resolves a client-type slug to its label without requiring the
 *  caller to know the freelancer's category. Slugs aren't globally
 *  unique (both videography and websites use `small_biz`) so the
 *  caller must pass the category when they have it; falls back to
 *  a first-hit search otherwise. */
export function findClientTypeLabel(
  category: CommunityCategoryId | null | undefined,
  slug: string | null | undefined,
): string | null {
  if (!slug) return null;
  if (category) {
    const hit = CLIENT_TYPES_BY_CATEGORY[category]?.find((o) => o.id === slug);
    if (hit) return hit.label;
  }
  // Fallback: scan every category. Returns the first label match so a
  // display surface without category context (e.g. a legacy card
  // render) still shows something human-readable.
  for (const options of Object.values(CLIENT_TYPES_BY_CATEGORY)) {
    const hit = options.find((o) => o.id === slug);
    if (hit) return hit.label;
  }
  return null;
}
