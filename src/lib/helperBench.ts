// The helper bench — who the customer is shown BEFORE they book.
// ---------------------------------------------------------------------------
// The booking sheet used to answer "who's coming to my house?" with an
// abstraction: "An ID-verified student, matched to your job". Every other
// trust surface on the site (the homepage cards, /helpers/:id, the /track
// helper card) leads with a real face, but the one moment that decides the
// booking had none.
//
// THE HONESTY RULE: this bench must show the SAME pool dispatch would offer
// the job to, or it's a trust feature that lies. So the filters mirror
// supabase/functions/_shared/helperMatch.ts and the two are held in lock-step
// by src/lib/__tests__/helperBench.test.ts — the same mirror pattern as
// extraTime, kit and the two pricing tables.
//
// It is DISPLAY ONLY and deliberately fail-soft: no faces, a slow query, a
// thin city — the sheet renders exactly as it did before. Nothing about
// booking may ever depend on this component resolving.

/** Mirror of CATCH_ALL_CATEGORIES — categories that dispatch to every
 *  approved id_verified helper instead of matching the `categories` array. */
export const BENCH_CATCH_ALL = ['custom', 'business'] as const;

export function isBenchCatchAll(category: string | null | undefined): boolean {
  return (BENCH_CATCH_ALL as readonly string[]).includes((category ?? '').trim());
}

/** Mirror of HELPER_MATCH_FILTERS. */
export const BENCH_FILTERS = {
  status: 'approved',
  is_available: true,
  id_verified: true,
} as const;

/** How many faces the sheet shows. Four fills the row on a phone without
 *  turning the decision moment into a directory. */
export const BENCH_LIMIT = 4;

/** Columns the bench reads. Every one is anon-SELECT-granted (household_helpers
 *  is column-level RLS — asking for an ungranted column 403s the WHOLE query,
 *  which is how the /verify-helper resume bug happened). Keep this list and
 *  the migrations' GRANT SELECT lists in agreement. */
export const BENCH_COLUMNS = [
  'id', 'name', 'photo_url', 'city', 'categories',
  'average_rating', 'rating_count', 'accepted_count',
  'id_verified', 'vano_verified',
] as const;

export interface BenchHelper {
  id: string;
  name: string | null;
  photo_url: string | null;
  city: string | null;
  categories: string[] | null;
  average_rating: number | null;
  rating_count: number | null;
  accepted_count: number | null;
  id_verified: boolean | null;
  vano_verified: boolean | null;
}

/** First name only — the bench is a reassurance, not a directory listing. */
export function benchFirstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'A helper';
}

/** The line under the faces. Deliberately says only what is provably true of
 *  the rows we actually got back: they are ID-verified (we filtered on it) and
 *  they can take this job (they matched the dispatch filters). It never
 *  promises WHICH one comes — the job goes to whoever accepts first. */
export function benchCaption(count: number, city: string | null | undefined): string {
  const where = city && city.trim() ? ` in ${city.trim()}` : '';
  if (count <= 0) return '';
  if (count === 1) return `1 ID-verified student${where} can take this job`;
  return `${count} ID-verified students${where} can take this job`;
}
