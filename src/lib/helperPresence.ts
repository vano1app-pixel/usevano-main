// Pure logic for the live "helpers online" pill, split out from the hook so it
// has no Supabase import and is unit-testable on its own.

/**
 * Below this, a literal "N helpers online" reads as a *thin* marketplace to a
 * first-time customer — "two people, in all of Galway?" — which manufactures
 * the exact "will anyone actually come?" fear we're trying to kill. So under
 * this floor we show a qualitative availability signal instead of the number.
 * Raise it as supply grows; once it's comfortably cleared, the real count is
 * the stronger social proof and shows automatically.
 */
export const REASSURING_MIN = 5;

export type HelperPresenceTier =
  | 'loading'   // request hasn't settled yet → skeleton
  | 'count'     // enough supply that the real number reassures
  | 'available' // 1–4 helpers: honest "available" without quoting a thin number
  | 'service';  // 0 / unknown: fall back to "same-day help in Galway"

/**
 * Decide how the pill should read. `ready` is false until the head-count
 * request settles, so the UI can tell "still loading" apart from "resolved to a
 * low/zero count" and never shimmer forever when supply is genuinely thin.
 */
export function helperPresenceTier(count: number, ready: boolean): HelperPresenceTier {
  if (!ready) return 'loading';
  if (count >= REASSURING_MIN) return 'count';
  if (count >= 1) return 'available';
  return 'service';
}
