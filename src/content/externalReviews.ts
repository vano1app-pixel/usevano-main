/**
 * Google + Trustpilot reviews — the ONE place to paste them.
 *
 * Feeds the homepage SocialProof band (the navy section that replaced the
 * podium, owner call 2026-07-29). Renders NOTHING it can't back up:
 *
 * HONESTY RULE (same as ReviewBadges): every entry here must be a REAL review
 * that exists on the platform, copied verbatim (trim length is fine, never
 * reword), and PLATFORM_STATS must be the REAL numbers from the profile.
 * Fake or "sample" reviews are a blacklisted commercial practice under
 * EU/Irish consumer law — the empty state is designed to look good, so
 * there is zero pressure to seed this. The section shows the bare platform
 * badges until entries land.
 *
 * To add a review (30 seconds):
 *   1. Open the review on Trustpilot / Google.
 *   2. Copy the text + first name + star count into a new entry below.
 *   3. Update PLATFORM_STATS with the profile's current rating + count.
 *
 * Example entry (shape reference only — never ship it uncommented):
 *   { source: 'trustpilot', name: 'Sarah', rating: 5,
 *     text: 'Booked at 10am, spotless house by 2. The student was lovely.',
 *     when: 'July 2026' },
 */

export type ExternalReviewSource = 'google' | 'trustpilot';

export interface ExternalReview {
  source: ExternalReviewSource;
  /** First name as shown on the platform. */
  name: string;
  /** 1–5, as left on the platform. */
  rating: number;
  /** Verbatim review text (trimming for length is fine). */
  text: string;
  /** Optional "July 2026"-style label, as shown on the platform. */
  when?: string;
}

/** Real profile numbers only — shown on the platform cards once set. */
export const PLATFORM_STATS: {
  google?: { rating: number; count: number };
  trustpilot?: { rating: number; count: number };
} = {};

export const EXTERNAL_REVIEWS: ExternalReview[] = [];
