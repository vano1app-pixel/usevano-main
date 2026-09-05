import { describe, expect, it } from 'vitest';
import {
  BENCH_CATCH_ALL,
  BENCH_FILTERS,
  BENCH_LIMIT,
  benchCaption,
  benchFirstName,
  isBenchCatchAll,
} from '../helperBench';
// The REAL server-side matching contract that dispatch-household-job runs.
import {
  CATCH_ALL_CATEGORIES,
  HELPER_MATCH_FILTERS,
  isCatchAllCategory,
} from '../../../supabase/functions/_shared/helperMatch';

// ── THE HONESTY INVARIANT ──────────────────────────────────────────────────
// The booking sheet shows the customer faces and says "these students can take
// this job". That sentence is only true while the bench's filters are the same
// filters dispatch uses to pick who gets the offer. If someone widens one side
// (say, drops the id_verified gate to make a thin city look busier), this test
// fails rather than the product quietly starting to lie.
describe('bench ↔ dispatch lock-step', () => {
  it('applies exactly the server-side offer filters', () => {
    expect(BENCH_FILTERS).toEqual(HELPER_MATCH_FILTERS);
  });

  it('keeps the ID-verified first-job gate — the claim on screen depends on it', () => {
    expect(BENCH_FILTERS.id_verified).toBe(true);
    expect(HELPER_MATCH_FILTERS.id_verified).toBe(true);
  });

  it('agrees on which categories dispatch to everyone', () => {
    expect([...BENCH_CATCH_ALL]).toEqual([...CATCH_ALL_CATEGORIES]);
  });

  it.each([...CATCH_ALL_CATEGORIES, 'cleaning', 'garden', 'laundry', 'pets', 'moving', 'unknown-slug', '', null])(
    'classifies %s identically on both sides', (cat) => {
      expect(isBenchCatchAll(cat as string | null)).toBe(isCatchAllCategory(cat as string | null));
    });
});

describe('bench presentation', () => {
  it('shows a handful of faces, not a directory', () => {
    expect(BENCH_LIMIT).toBeGreaterThan(1);
    expect(BENCH_LIMIT).toBeLessThanOrEqual(6);
  });

  it('uses first names only', () => {
    expect(benchFirstName('Aoife Ryan')).toBe('Aoife');
    expect(benchFirstName('  Cian   O Brien ')).toBe('Cian');
  });

  it('degrades to a neutral label rather than an empty or "undefined" name', () => {
    expect(benchFirstName(null)).toBe('A helper');
    expect(benchFirstName('   ')).toBe('A helper');
  });

  it('says nothing at all when there is nobody to show', () => {
    expect(benchCaption(0, 'Galway')).toBe('');
  });

  it('counts honestly and names the city when we have one', () => {
    expect(benchCaption(1, 'Galway')).toBe('1 ID-verified student in Galway can take this job');
    expect(benchCaption(4, 'Galway')).toBe('4 ID-verified students in Galway can take this job');
    expect(benchCaption(3, null)).toBe('3 ID-verified students can take this job');
    expect(benchCaption(3, '  ')).toBe('3 ID-verified students can take this job');
  });

  it('never claims a specific helper is coming — the job goes to whoever accepts', () => {
    for (const n of [1, 2, 5]) {
      const c = benchCaption(n, 'Galway');
      expect(c).toContain('can take this job');
      expect(c).not.toMatch(/will|your helper|assigned/i);
    }
  });
});
