/** Canonical skill tags for freelancer profiles and Community listing wizard */
export const FREELANCER_SKILL_OPTIONS = [
  'Social Media',
  'Marketing',
  'Graphic Design',
  'Video Editing',
  'Web Design',
  'Photography',
  'Admin',
  'Events',
] as const;

export type FreelancerSkillId = (typeof FREELANCER_SKILL_OPTIONS)[number];

/** For filters (e.g. top students): "All" plus each skill */
export const FREELANCER_SKILL_CATEGORIES = ['All', ...FREELANCER_SKILL_OPTIONS] as const;

const skillSet = new Set<string>(FREELANCER_SKILL_OPTIONS);

/** Drops legacy tags (e.g. removed "Writing") so only canonical options remain */
export function normalizeFreelancerSkills(saved: string[] | null | undefined): string[] {
  if (!saved?.length) return [];
  return saved.filter((s) => skillSet.has(s));
}
