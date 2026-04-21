import type { CommunityCategoryId } from '@/lib/communityCategories';

// Per-category "what do you actually do" sub-dimension. Listed in the
// order a hirer's brain maps to the category — most common first — so
// the wizard's pill picker gets to "the right one" in the first glance
// instead of a visual scan.
//
// These are intentionally small (5 picks each). The whole point of the
// specialty field is to be one decisive click — if there are 10 options,
// it becomes a scrollable list and nobody picks anything in particular.
// Stored on student_profiles.specialty as the slug (not the label) so
// the label copy can evolve without orphaning old rows.

export interface CategorySpecialty {
  /** Stable slug saved to the DB. Never rename without a data migration. */
  id: string;
  /** User-facing label shown in the picker + on the card pill. */
  label: string;
}

export interface CategorySpecialtyConfig {
  /** Heading shown above the picker in the wizard. */
  prompt: string;
  options: readonly CategorySpecialty[];
}

export const SPECIALTIES_BY_CATEGORY: Record<CommunityCategoryId, CategorySpecialtyConfig> = {
  videography: {
    prompt: 'What do you mostly shoot?',
    options: [
      { id: 'weddings', label: 'Weddings' },
      { id: 'events', label: 'Events & parties' },
      { id: 'corporate', label: 'Corporate & promo' },
      { id: 'music_creative', label: 'Music & creative' },
      { id: 'real_estate', label: 'Real estate' },
    ],
  },
  websites: {
    prompt: 'How do you build?',
    options: [
      { id: 'custom_code', label: 'Custom code' },
      { id: 'shopify', label: 'Shopify' },
      { id: 'webflow', label: 'Webflow' },
      { id: 'wordpress', label: 'WordPress' },
      { id: 'framer', label: 'Framer' },
    ],
  },
  social_media: {
    prompt: 'Main platform you make for?',
    options: [
      { id: 'tiktok', label: 'TikTok' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'youtube', label: 'YouTube' },
      { id: 'linkedin', label: 'LinkedIn' },
      { id: 'cross_platform', label: 'Cross-platform' },
    ],
  },
  digital_sales: {
    prompt: 'Who do you sell to?',
    options: [
      { id: 'b2b_saas', label: 'B2B SaaS' },
      { id: 'agencies', label: 'Agencies' },
      { id: 'ecommerce', label: 'E-commerce' },
      { id: 'local_services', label: 'Local services' },
      { id: 'enterprise', label: 'Enterprise' },
    ],
  },
};

/** Lookup helper — resolves a specialty slug to its user-facing label. */
export function specialtyLabel(
  category: CommunityCategoryId | null | undefined,
  slug: string | null | undefined,
): string | null {
  if (!category || !slug) return null;
  const found = SPECIALTIES_BY_CATEGORY[category]?.options.find((o) => o.id === slug);
  return found?.label ?? null;
}

/** True when the slug is a recognised specialty for the given category. */
export function isValidSpecialty(
  category: CommunityCategoryId | null | undefined,
  slug: string | null | undefined,
): boolean {
  if (!category || !slug) return false;
  return !!SPECIALTIES_BY_CATEGORY[category]?.options.some((o) => o.id === slug);
}

/** Finds a specialty label without requiring the caller to know the
 *  freelancer's category — used by display surfaces like StudentCard
 *  that only receive the slug. Slugs are unique across categories
 *  by design (see SPECIALTIES_BY_CATEGORY), so a single pass hits
 *  exactly one match or none. Returns null for unknown slugs so
 *  deleted / renamed options silently fall back to category-only
 *  display instead of rendering a broken pill. */
export function findSpecialtyLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  for (const config of Object.values(SPECIALTIES_BY_CATEGORY)) {
    const hit = config.options.find((o) => o.id === slug);
    if (hit) return hit.label;
  }
  return null;
}
