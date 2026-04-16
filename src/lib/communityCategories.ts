import { Clapperboard, Globe, Share2, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CommunityCategoryId = 'videography' | 'digital_sales' | 'websites' | 'social_media';

/**
 * Is this category inherently local (freelancer must show up in person,
 * so county matching matters) or digital (remote-by-default, can be
 * hired from anywhere in Ireland)?
 *
 * Videography is the only local category today — a shoot happens on
 * location. The other three are digital: a website builder in Dublin
 * can ship a site for a café in Cork without leaving their desk.
 *
 * The hire flow branches on this: for local categories we ask the
 * hirer for their county and filter matches; for digital we skip the
 * location question entirely and match across all of Ireland.
 */
export type CategoryLocationModel = 'local' | 'digital';

export const COMMUNITY_CATEGORY_ORDER: CommunityCategoryId[] = ['digital_sales', 'videography', 'websites', 'social_media'];

export const COMMUNITY_CATEGORIES: Record<
  CommunityCategoryId,
  { label: string; description: string; icon: LucideIcon; locationModel: CategoryLocationModel }
> = {
  digital_sales: {
    label: 'Digital sales',
    description: 'Outbound sales, lead gen, and closing deals on commission.',
    icon: TrendingUp,
    locationModel: 'digital',
  },
  videography: {
    label: 'Videography',
    description: 'Filming, editing, reels, TikToks, and promotional videos.',
    icon: Clapperboard,
    locationModel: 'local',
  },
  websites: {
    label: 'Websites',
    description: 'Design, build, landing pages, and web fixes.',
    icon: Globe,
    locationModel: 'digital',
  },
  social_media: {
    // Display label broadened from "Social media" so it also speaks to UGC
    // creators and brand-promo work. The ID stays `social_media` so every
    // existing freelancer row, URL slug, and deep link keeps working.
    label: 'Content creation',
    description: 'UGC, social media management, content & brand promotion.',
    icon: Share2,
    locationModel: 'digital',
  },
};

export function isCommunityCategoryId(v: string | null): v is CommunityCategoryId {
  return v === 'videography' || v === 'digital_sales' || v === 'websites' || v === 'social_media';
}

export function categoryLabel(id: CommunityCategoryId): string {
  return COMMUNITY_CATEGORIES[id].label;
}
