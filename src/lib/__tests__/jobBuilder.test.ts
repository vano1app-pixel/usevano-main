import { describe, expect, it } from 'vitest';
import {
  BUILDER_MARKET_RATE_CENTS,
  BUILDER_TASKS,
  builderMarketCents,
  builderMinutes,
  builderNote,
  builderShortLabel,
  builderSizeLabel,
} from '../jobBuilder';
import { HOURLY_RATE_CENTS, getHouseholdPriceCents } from '../householdPricing';

// The size chips each builder category offers in CategoryGrid. Kept in
// lock-step by hand (the arrays live inside the component) — if the sheet's
// sizes change, this test is the tripwire that the builder still rounds to
// labels the sheet and server actually price.
const SHEET_SIZES: Record<string, string[]> = {
  cleaning: ['1 hour', '2 hours', '3 hours'],
  garden:   ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours', '7 hours', '8 hours'],
  moving:   ['1 hour', '2 hours', '3 hours', '4+ hours'],
};

const allSubsets = <T,>(items: T[]): T[][] =>
  items.reduce<T[][]>((acc, item) => [...acc, ...acc.map((s) => [...s, item])], [[]]);

describe('jobBuilder — the builder can never invent a price', () => {
  it('covers exactly the hourly categories the sheet prices at €18/hr', () => {
    for (const slug of Object.keys(BUILDER_TASKS)) {
      expect(SHEET_SIZES[slug], `${slug} needs a SHEET_SIZES entry`).toBeDefined();
      expect(HOURLY_RATE_CENTS[slug]).toBe(1800);
    }
  });

  it('every possible tick combination rounds to a size the category offers and the table prices', () => {
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      for (const subset of allSubsets(tasks.map((t) => t.key))) {
        const size = builderSizeLabel(builderMinutes(slug, subset), SHEET_SIZES[slug]);
        if (subset.length === 0) {
          expect(size).toBeNull();
          continue;
        }
        expect(size, `${slug} ${subset.join('+')}`).not.toBeNull();
        expect(SHEET_SIZES[slug]).toContain(size as string);
        expect(getHouseholdPriceCents(slug, size as string)).not.toBeNull();
      }
    }
  });

  it('rounds minutes UP and caps at the biggest label', () => {
    const sizes = SHEET_SIZES.garden;
    expect(builderSizeLabel(builderMinutes('garden', ['mowing']), sizes)).toBe('1 hour'); // 45 min
    expect(builderSizeLabel(builderMinutes('garden', ['mowing', 'weeding']), sizes)).toBe('2 hours'); // 90 min
    expect(builderSizeLabel(builderMinutes('garden', ['mowing', 'weeding', 'hedges']), sizes)).toBe('2 hours'); // 120 min
    // Cleaning maxes at 3 hours: all six tasks (3h30m) cap there — the note
    // still lists everything, so the helper knows the full ask.
    const allCleaning = BUILDER_TASKS.cleaning.map((t) => t.key);
    expect(builderSizeLabel(builderMinutes('cleaning', allCleaning), SHEET_SIZES.cleaning)).toBe('3 hours');
  });

  it('market anchors stay display-only, conservative, and above the €18/hr rate', () => {
    for (const [slug, rate] of Object.entries(BUILDER_MARKET_RATE_CENTS)) {
      expect(rate).toBeGreaterThan(HOURLY_RATE_CENTS[slug]); // "you save" can never go negative
      const market = builderMarketCents(slug, '2 hours');
      const vano = getHouseholdPriceCents(slug, '2 hours');
      expect(market).not.toBeNull();
      expect(vano).not.toBeNull();
      expect(market as number).toBeGreaterThan(vano as number);
    }
  });

  it('composes the note and short label helpers read on offers', () => {
    expect(builderNote('garden', ['weeding', 'mowing'])).toBe('Lawn mowing + Weeding & beds'); // task-list order, not tick order
    expect(builderShortLabel('garden', ['mowing'])).toBe('Lawn mowing');
    expect(builderShortLabel('garden', ['mowing', 'weeding', 'hedges'])).toBe('Lawn mowing +2');
    expect(builderShortLabel('garden', [])).toBeNull();
    expect(builderMinutes('garden', ['not-a-key'])).toBe(0); // fail-soft on unknown keys
  });
});
