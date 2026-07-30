import { describe, expect, it } from 'vitest';
import {
  HELPER_KIT_OPTIONS,
  HIREABLE_KIT,
  KIT_HIRE_CENTS,
  KIT_SLUGS,
  helperHasKit,
  kitHireCents,
  kitLabel,
  normalizeKit,
} from '../kit';
// The REAL server module the edge functions run — same cross-check pattern as
// the price tables: checkout prices the kit and dispatch matches on it, so the
// frontend mirror can never be allowed to drift.
import {
  HELPER_KIT_OPTIONS as SERVER_OPTIONS,
  HIREABLE_KIT as SERVER_HIREABLE,
  KIT_HIRE_CENTS as SERVER_HIRE_CENTS,
  helperHasKit as serverHelperHasKit,
  kitHireCents as serverKitHireCents,
  normalizeKit as serverNormalizeKit,
} from '../../../supabase/functions/_shared/kit';

describe('kit — "we\'ll bring the mower"', () => {
  it('the frontend mirror and the server module are identical', () => {
    expect(HELPER_KIT_OPTIONS).toEqual(SERVER_OPTIONS);
    expect(KIT_HIRE_CENTS).toEqual(SERVER_HIRE_CENTS);
    expect(HIREABLE_KIT).toEqual(SERVER_HIREABLE);
  });

  it('every hireable slug is one a helper can actually tick', () => {
    // The whole loop depends on these two lists agreeing: we sell "helper
    // brings a mower" and then filter helpers on own_kit. A hireable slug
    // that no helper can ever tick would be a promise nobody can fulfil.
    for (const slug of HIREABLE_KIT) {
      expect(KIT_SLUGS, `${slug} is sellable but not tickable`).toContain(slug);
      expect(KIT_HIRE_CENTS[slug]).toBeGreaterThan(0);
    }
    // …and the free stuff stays free. Charging to carry gloves in a backpack
    // would be charging for nothing.
    for (const slug of ['garden-tools', 'hoover', 'cleaning-products']) {
      expect(KIT_SLUGS).toContain(slug);
      expect(HIREABLE_KIT, `${slug} must not be chargeable`).not.toContain(slug);
      expect(kitHireCents([slug])).toBe(0);
    }
  });

  it('slugs are a stored data contract — kebab-case, unique, stable', () => {
    // These live in household_helpers.own_kit on real rows. Rename one and
    // every existing helper silently stops matching the jobs they own gear for.
    expect(new Set(KIT_SLUGS).size).toBe(KIT_SLUGS.length);
    for (const { slug, label, emoji } of HELPER_KIT_OPTIONS) {
      expect(slug, `${slug} must be kebab-case`).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(label.length).toBeGreaterThan(2);
      expect(emoji.length).toBeGreaterThan(0);
    }
    // Pin the two we sell, so a rename has to be a deliberate act.
    expect(KIT_HIRE_CENTS['lawn-mower']).toBe(1000);
    expect(KIT_HIRE_CENTS['power-washer']).toBe(1200);
  });

  it('prices a list, on both modules, and ignores anything it does not sell', () => {
    const cases: string[][] = [
      [], ['lawn-mower'], ['power-washer'], ['lawn-mower', 'power-washer'],
      ['garden-tools'], ['hoover', 'lawn-mower'], ['not-a-thing'],
    ];
    for (const c of cases) {
      expect(kitHireCents(c), c.join('+')).toBe(serverKitHireCents(c));
    }
    expect(kitHireCents(['lawn-mower', 'power-washer'])).toBe(2200);
    expect(kitHireCents(null)).toBe(0);
    expect(kitHireCents(undefined)).toBe(0);
  });

  it('normalizeKit is FAIL-SOFT — junk is dropped, never a 400', () => {
    // A stale client, the WhatsApp door or an old deep link must be able to
    // book without gear rather than have the booking die over it.
    expect(normalizeKit(['lawn-mower'])).toEqual(['lawn-mower']);
    expect(normalizeKit('lawn-mower,power-washer')).toEqual(['lawn-mower', 'power-washer']);
    expect(normalizeKit(['lawn-mower', 'lawn-mower'])).toEqual(['lawn-mower']); // deduped
    expect(normalizeKit(['garden-tools'])).toEqual([]);   // real slug, not sellable
    expect(normalizeKit(['<script>'])).toEqual([]);
    expect(normalizeKit(null)).toEqual([]);
    expect(normalizeKit(undefined)).toEqual([]);
    expect(normalizeKit(42)).toEqual([]);
    expect(normalizeKit({ lawnMower: true })).toEqual([]);
    // Order is stable and the list can't be inflated past what we sell.
    expect(normalizeKit(Array(50).fill('lawn-mower')).length).toBe(1);
    for (const raw of [['lawn-mower'], 'power-washer', null, 42, ['x'], ['hoover']]) {
      expect(normalizeKit(raw), String(raw)).toEqual(serverNormalizeKit(raw));
    }
  });

  it('the dispatch match is strict: no kit ticked means no kit jobs', () => {
    // Promising a mower and sending someone empty-handed is worse than never
    // having offered it, so a missing/NULL own_kit must NOT match.
    expect(helperHasKit(['lawn-mower'], ['lawn-mower'])).toBe(true);
    expect(helperHasKit(['lawn-mower', 'hoover'], ['lawn-mower'])).toBe(true);
    expect(helperHasKit(['hoover'], ['lawn-mower'])).toBe(false);
    expect(helperHasKit(null, ['lawn-mower'])).toBe(false);
    expect(helperHasKit(undefined, ['lawn-mower'])).toBe(false);
    expect(helperHasKit(['lawn-mower'], ['lawn-mower', 'power-washer'])).toBe(false);
    // …but a job needing nothing reaches everyone, kit or no kit. This is the
    // property that keeps the ordinary funnel untouched by all of the above.
    expect(helperHasKit(null, [])).toBe(true);
    expect(helperHasKit(null, null)).toBe(true);
    expect(helperHasKit([], undefined)).toBe(true);
    for (const [owned, need] of [
      [['lawn-mower'], ['lawn-mower']], [null, ['lawn-mower']], [[], []], [['hoover'], []],
    ] as Array<[string[] | null, string[]]>) {
      expect(helperHasKit(owned, need)).toBe(serverHelperHasKit(owned, need));
    }
  });

  it('labels read like a sentence for notes and offers', () => {
    expect(kitLabel(['lawn-mower'])).toBe('Lawn mower');
    expect(kitLabel(['lawn-mower', 'power-washer'])).toBe('Lawn mower + power washer');
    expect(kitLabel([])).toBe('');
    expect(kitLabel(null)).toBe('');
    expect(kitLabel(['not-a-thing'])).toBe('');
  });
});
