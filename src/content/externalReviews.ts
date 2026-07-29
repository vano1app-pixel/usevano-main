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

/** Real profile numbers only — shown on the platform cards once set.
 *  Google has live reviews (below) but the PROFILE's displayed rating +
 *  total count haven't been confirmed by the owner yet — paste them here
 *  (e.g. { rating: 4.3, count: 3 }) exactly as Google shows them and the
 *  doors upgrade automatically. Never derive or guess the number. */
export const PLATFORM_STATS: {
  google?: { rating: number; count: number };
  trustpilot?: { rating: number; count: number };
} = {};

// Real Google reviews, supplied by the owner from the live profile
// (screenshots, 2026-07-29) and copied verbatim — lowercase and all; the
// rule is trim-only, never reword. Karan's review is truncated on the
// profile card ("View full review"), so it's trimmed at the end of its
// first sentence rather than guessed.
export const EXTERNAL_REVIEWS: ExternalReview[] = [
  {
    source: 'google',
    name: 'Armaan',
    rating: 5,
    text: 'My dog loves the fella who came for dog walking more than me, 10/10 would use the platform again.',
    when: 'July 2026',
  },
  {
    source: 'google',
    name: 'Karan',
    rating: 4,
    text: 'I hired a lovely girl from Vano to help my granny with cleaning.',
    when: 'July 2026',
  },
  {
    source: 'google',
    name: 'Manoj',
    rating: 4,
    text: 'sound fella came in cleaned my house before I had to move out of student accommodation in glasan',
    when: 'July 2026',
  },
];
