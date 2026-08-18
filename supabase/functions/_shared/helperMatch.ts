// WHO GETS OFFERED THIS JOB — the one definition, server side.
// ---------------------------------------------------------------------------
// dispatch-household-job decides the real pool. The booking sheet's helper
// bench SHOWS that pool to the customer before they book ("these four could
// take it"). If the two ever drift, the sheet is showing faces that would
// never actually receive the offer — a trust feature that quietly lies, which
// is worse than no trust feature. So the matching contract lives here, and
// src/lib/helperBench.ts mirrors it under a lock-step test (same pattern as
// _shared/extraTime.ts ↔ src/lib/extraTime.ts and the two pricing tables).
//
// Pure TypeScript, no Deno APIs — vitest imports it directly.

/** Categories that dispatch to EVERY approved id_verified helper rather than
 *  matching the `categories` array: they aren't join-form skills.
 *  - `custom`   — the "name any job" catalogue.
 *  - `business` — the parked premium tile; still reachable by old deep links. */
export const CATCH_ALL_CATEGORIES = ['custom', 'business'] as const;

export function isCatchAllCategory(category: string | null | undefined): boolean {
  return (CATCH_ALL_CATEGORIES as readonly string[]).includes((category ?? '').trim());
}

/** The non-negotiable filters every offer query applies, in both places.
 *  Documented as data so the lock-step test can assert the mirror agrees:
 *    status = 'approved'   — rejected/pending helpers are not a pool
 *    is_available = true   — the live switch
 *    id_verified = true    — THE FIRST-JOB GATE. This is what makes the
 *                            customer-facing claim "an ID-verified student"
 *                            literally true, and it keys on the free ID check
 *                            alone, never the paid ✓ tick. */
export const HELPER_MATCH_FILTERS = {
  status: 'approved',
  is_available: true,
  id_verified: true,
} as const;

/** Offer order: ✓-Verified helpers first (the €2/month tick must buy
 *  something real), then fair rotation by fewest accepted jobs. */
export const HELPER_MATCH_ORDER = [
  { column: 'vano_verified', ascending: false },
  { column: 'accepted_count', ascending: true },
] as const;
