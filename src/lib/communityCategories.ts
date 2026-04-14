import { Clapperboard, Globe, Share2, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CommunityCategoryId = 'videography' | 'digital_sales' | 'websites' | 'social_media';

export const COMMUNITY_CATEGORY_ORDER: CommunityCategoryId[] = ['digital_sales', 'videography', 'websites', 'social_media'];

export const COMMUNITY_CATEGORIES: Record<
  CommunityCategoryId,
  { label: string; description: string; icon: LucideIcon }
> = {
  digital_sales: {
    label: 'Digital sales',
    description: 'Outbound sales, lead gen, and closing deals on commission.',
    icon: TrendingUp,
  },
  videography: {
    label: 'Videography',
    description: 'Filming, editing, reels, TikToks, and promotional videos.',
    icon: Clapperboard,
  },
  websites: {
    label: 'Websites',
    description: 'Design, build, landing pages, and web fixes.',
    icon: Globe,
  },
  social_media: {
    label: 'Social media',
    description: 'Content, strategy, community management, and growth.',
    icon: Share2,
  },
};

export function isCommunityCategoryId(v: string | null): v is CommunityCategoryId {
  return v === 'videography' || v === 'digital_sales' || v === 'websites' || v === 'social_media';
}

export function categoryLabel(id: CommunityCategoryId): string {
  return COMMUNITY_CATEGORIES[id].label;
}
