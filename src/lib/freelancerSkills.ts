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
    // 'Social Media' is kept in the list for backward-compat: existing
    // freelancers have it selected on live rows. The category is now labelled
    // 'Content Creation' elsewhere in the UI so 'UGC' and 'Brand Promotion'
    // are surfaced as first-class picker options.
    'Social Media',
    'Content Creation',
    'UGC',
    'Brand Promotion',
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
  digital_sales: [
    'Cold Calling',
    'Cold Email',
    'LinkedIn Prospecting',
    'Lead Generation',
    'Appointment Setting',
    'B2B Sales',
    'B2C Sales',
    'SaaS Sales',
    'Discovery Calls',
    'Objection Handling',
    'Closing',
    'Negotiation',
    'Sales Copywriting',
    'CRM Management',
    'Pipeline Management',
    'Account Management',
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
