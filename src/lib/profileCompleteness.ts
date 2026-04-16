/**
 * Shared profile-completeness scoring used by the on-profile completeness
 * meter (Profile.tsx) and the public-profile quality tier badge
 * (StudentProfile.tsx). Keeping both in one place guarantees the "100%
 * complete" threshold on a public profile means the same thing as on the
 * owner's editor.
 *
 * Weights sum to 100 (no hidden fields scoring). The input fields are
 * intentionally the same ones the owner can fix from their Profile page.
 */

export type ProfileCompletenessSource = {
  displayName: string | null | undefined;
  avatarUrl: string | null | undefined;
  bio: string | null | undefined;
  bannerUrl: string | null | undefined;
  phone: string | null | undefined;
  /**
   * Retained in the type for call-site compatibility (the wizard and
   * profile page still collect it as a decorative field) but no longer
   * scored — the completeness % intentionally doesn't include it now
   * that we're Ireland-wide and university is a Galway-leaning optional
   * field rather than a required trust signal.
   */
  university?: string | null | undefined;
  skills: string[] | null | undefined;
  portfolioCount: number;
};

export type CompletenessCheck = {
  key: 'name' | 'avatar' | 'bio' | 'banner' | 'phone' | 'skills' | 'portfolio';
  label: string;
  done: boolean;
  weight: number;
};

export function computeProfileChecks(src: ProfileCompletenessSource): CompletenessCheck[] {
  // Weights sum to 100. University's old 5% was absorbed into `portfolio`
  // (15 → 20) because portfolio is the scarcest and most-lifting signal on
  // a marketplace card today.
  return [
    { key: 'name', label: 'Add your name', done: !!src.displayName?.trim(), weight: 10 },
    { key: 'avatar', label: 'Add a profile photo', done: !!src.avatarUrl?.trim(), weight: 15 },
    { key: 'bio', label: 'Write a short bio (50+ chars)', done: (src.bio?.trim().length ?? 0) >= 50, weight: 15 },
    { key: 'banner', label: 'Upload a cover photo', done: !!src.bannerUrl?.trim(), weight: 15 },
    { key: 'phone', label: 'Add your phone number', done: !!src.phone?.trim(), weight: 10 },
    { key: 'skills', label: 'Pick at least 3 skills', done: (src.skills?.length ?? 0) >= 3, weight: 15 },
    { key: 'portfolio', label: 'Upload 2+ portfolio photos', done: src.portfolioCount >= 2, weight: 20 },
  ];
}

export function computeProfilePercent(src: ProfileCompletenessSource): number {
  return computeProfileChecks(src)
    .filter((c) => c.done)
    .reduce((sum, c) => sum + c.weight, 0);
}

/**
 * Visual tier shown on the public profile.
 *  - 100% complete AND 5+ reviews → 'top'  (gold)
 *  - 100% complete AND < 5 reviews → 'verified'  (emerald tick)
 *  - Anything less → null (no badge; don't punish new freelancers)
 */
export type ProfileTier = 'top' | 'verified' | null;

export function computeProfileTier(percent: number, reviewCount: number): ProfileTier {
  if (percent < 100) return null;
  if (reviewCount >= 5) return 'top';
  return 'verified';
}
