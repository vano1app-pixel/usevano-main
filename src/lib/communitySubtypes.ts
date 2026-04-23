/**
 * Sub-type chip labels shared between the freelancer QuickStart picker
 * and the full wizard. Mirrors the subtype list HirePage uses for hirer
 * briefs verbatim — keeping the vocabulary identical means the AI Find
 * matcher gets clean token overlap when a hirer's brief and a
 * freelancer's stored title are about the same kind of work.
 *
 * Single source of truth so QuickStart and the wizard can't drift.
 */

import type { CommunityCategoryId } from '@/lib/communityCategories';

export const SUBTYPES_BY_CATEGORY: Record<CommunityCategoryId, readonly string[]> = {
  videography: [
    'Reel / short-form',
    'Promo / ad',
    'Event / wedding',
    'Corporate / explainer',
    'Podcast / interview',
  ],
  digital_sales: [
    'Cold email outreach',
    'Cold calling / SDR',
    'Lead generation',
    'Appointment setting',
    'Sales closing',
  ],
  websites: [
    'Landing page',
    'Full website',
    'Shopify / e-commerce',
    'Fix / improve existing',
    'Web app / dashboard',
  ],
  social_media: [
    'Content / posts',
    'Strategy & growth',
    'Paid ads',
    'Community management',
    'Short-form (TikTok / Reels)',
  ],
};

/**
 * True when a title string was likely auto-filled from the QuickStart
 * subtype picker rather than written freely by the user. The full
 * wizard uses this to add a "we filled this from your category — refine
 * if you like" hint, so a returning freelancer doesn't think their
 * headline is locked when it's actually editable scaffold.
 */
export function isSubtypeLabel(
  category: CommunityCategoryId | null,
  title: string | null | undefined,
): boolean {
  if (!category || !title) return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return (SUBTYPES_BY_CATEGORY[category] as readonly string[]).includes(trimmed);
}
