import type { CommunityCategoryId } from '@/lib/communityCategories';

/** Skills shown in the wizard based on the chosen category */
export const SKILLS_BY_CATEGORY: Record<CommunityCategoryId, readonly string[]> = {
  websites: [
    'Web Design',
    'Web Development',
    'WordPress',
    'Shopify',
    'React / JavaScript',
    'UI / UX Design',
    'SEO',
    'Graphic Design',
  ],
  social_media: [
    'Social Media',
    'Content Creation',
    'Marketing',
    'Copywriting',
    'Email Marketing',
    'Graphic Design',
    'Paid Ads',
    'Brand Strategy',
  ],
  videography: [
    'Video Editing',
    'Videography',
    'Drone Footage',
    'Reels & Short Form',
    'Colour Grading',
    'Wedding Films',
    'Event Coverage',
    'Promotional Video',
  ],
  photography: [
    'Photography',
    'Wedding Photography',
    'Event Photography',
    'Product Photography',
    'Brand Photography',
    'Portrait / Headshots',
    'Food Photography',
    'Photo Editing',
  ],
};

/** All unique skills across every category (used for normalisation) */
export const ALL_SKILL_OPTIONS: readonly string[] = [
  ...new Set(Object.values(SKILLS_BY_CATEGORY).flat()),
];

/** Legacy flat list kept for any existing references outside the wizard */
export const FREELANCER_SKILL_OPTIONS = ALL_SKILL_OPTIONS;

export type FreelancerSkillId = string;

export const FREELANCER_SKILL_CATEGORIES = ['All', ...ALL_SKILL_OPTIONS] as const;

const skillSet = new Set<string>(ALL_SKILL_OPTIONS);

/** Keeps only recognised skill tags; legacy tags are dropped */
export function normalizeFreelancerSkills(saved: string[] | null | undefined): string[] {
  if (!saved?.length) return [];
  return saved.filter((s) => skillSet.has(s));
}
