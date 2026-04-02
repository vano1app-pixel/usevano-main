import { Clapperboard, Globe, Share2, Camera } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type CommunityCategoryId = 'videography' | 'photography' | 'websites' | 'social_media';

export const COMMUNITY_CATEGORY_ORDER: CommunityCategoryId[] = ['videography', 'photography', 'websites', 'social_media'];

export const COMMUNITY_CATEGORIES: Record<
  CommunityCategoryId,
  { label: string; description: string; icon: LucideIcon }
> = {
  videography: {
    label: 'Videography',
    description: 'Filming, editing, reels, TikToks, and promotional videos.',
    icon: Clapperboard,
  },
  photography: {
    label: 'Photography',
    description: 'Brand photos, product shots, events, and headshots.',
    icon: Camera,
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
  return v === 'videography' || v === 'photography' || v === 'websites' || v === 'social_media';
}

export function categoryLabel(id: CommunityCategoryId): string {
  return COMMUNITY_CATEGORIES[id].label;
}
