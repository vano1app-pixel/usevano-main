import { Clapperboard, Globe, Share2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CommunityCategoryId = 'videographer' | 'websites' | 'social_media';

export const COMMUNITY_CATEGORY_ORDER: CommunityCategoryId[] = ['videographer', 'websites', 'social_media'];

export const COMMUNITY_CATEGORIES: Record<
  CommunityCategoryId,
  { label: string; description: string; icon: LucideIcon }
> = {
  videographer: {
    label: 'Videographer',
    description: 'Filming, editing, reels, events, and production.',
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
  return v === 'videographer' || v === 'websites' || v === 'social_media';
}

export function categoryLabel(id: CommunityCategoryId): string {
  return COMMUNITY_CATEGORIES[id].label;
}
