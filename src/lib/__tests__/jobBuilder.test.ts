import { describe, expect, it } from 'vitest';
import {
  BUILDER_MARKET_RATE_CENTS,
  BUILDER_TASKS,
  SIZING_QUESTIONS,
  builderMarketCents,
  builderMinutes,
  builderNote,
  builderShortLabel,
  builderSizeLabel,
  scaledTaskMinutes,
} from '../jobBuilder';
import { HOURLY_RATE_CENTS, LAUNDRY_BAG_CENTS, getHouseholdPriceCents } from '../householdPricing';

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

  it('every possible tick combination computes a priceable half-hour size within the category cap', () => {
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      const maxHours = Math.max(...SHEET_SIZES[slug].map((s) => Number(s.match(/^\d+(\.\d+)?/)?.[0] ?? 0)));
      for (const subset of allSubsets(tasks.map((t) => t.key))) {
        const size = builderSizeLabel(builderMinutes(slug, subset), SHEET_SIZES[slug]);
        if (subset.length === 0) {
          expect(size).toBeNull();
          continue;
        }
        expect(size, `${slug} ${subset.join('+')}`).not.toBeNull();
        const hours = Number((size as string).match(/^\d+(\.\d+)?/)?.[0]);
        expect(hours).toBeGreaterThanOrEqual(1);
        expect(hours).toBeLessThanOrEqual(maxHours);
        expect(hours * 2, 'half-hour steps only').toBe(Math.round(hours * 2));
        expect(getHouseholdPriceCents(slug, size as string), `${slug} / ${size}`).not.toBeNull();
      }
    }
  });

  it('rounds minutes UP in half-hour steps and caps at the biggest label', () => {
    const sizes = SHEET_SIZES.garden;
    expect(builderSizeLabel(builderMinutes('garden', ['mowing']), sizes)).toBe('1 hour'); // 45 min → 1h floor
    expect(builderSizeLabel(builderMinutes('garden', ['mowing', 'weeding']), sizes)).toBe('1.5 hours'); // 90 min
    expect(builderSizeLabel(builderMinutes('garden', ['mowing', 'weeding', 'hedges']), sizes)).toBe('2 hours'); // 120 min
    // Cleaning maxes at 3 hours: all six tasks (3h30m) cap there — the note
    // still lists everything, so the helper knows the full ask.
    const allCleaning = BUILDER_TASKS.cleaning.map((t) => t.key);
    expect(builderSizeLabel(builderMinutes('cleaning', allCleaning), SHEET_SIZES.cleaning)).toBe('3 hours');
  });

  it('every extra tick moves the price (the 2026-07-27 owner report: 2 vs 3 cleaning choices cost the same)', () => {
    const sizes = SHEET_SIZES.cleaning;
    const price = (keys: string[]) =>
      getHouseholdPriceCents('cleaning', builderSizeLabel(builderMinutes('cleaning', keys), sizes) as string);
    expect(price(['kitchen', 'bathroom'])).toBe(2700);                        // 75 min → 1.5h
    expect(price(['kitchen', 'bathroom', 'bedrooms'])).toBe(3600);            // 120 min → 2h
    expect(price(['kitchen', 'bathroom', 'bedrooms', 'floors'])).toBe(4500);  // 150 min → 2.5h
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

describe('sizing questions — the one-tap speed wizard can never invent a price', () => {
  it('every option is exactly one honest shape: factor (builder), size (existing label) or carry-only info', () => {
    for (const [slug, q] of Object.entries(SIZING_QUESTIONS)) {
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.why.length).toBeGreaterThan(0);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      for (const opt of q.options) {
        if (BUILDER_TASKS[slug]) {
          // Builder categories scale minutes — they never jump labels directly
          expect(opt.factor, `${slug}/${opt.key} needs a factor`).toBeGreaterThan(0);
          expect(opt.size).toBeUndefined();
          expect(opt.carry, `${slug}/${opt.key} must reach the helper's note`).toBeTruthy();
        } else {
          expect(opt.factor, `${slug}/${opt.key}: factors are builder-only`).toBeUndefined();
          // Non-builder options either pick a REAL priceable size label…
          if (opt.size) expect(getHouseholdPriceCents(slug, opt.size), `${slug}/${opt.size}`).not.toBeNull();
          // …or are pure info that must ride to the helper.
          else expect(opt.carry, `${slug}/${opt.key} must carry or size`).toBeTruthy();
        }
      }
    }
  });

  it('factor answers keep EVERY tick combination priceable within the category cap', () => {
    for (const [slug, q] of Object.entries(SIZING_QUESTIONS)) {
      const tasks = BUILDER_TASKS[slug];
      if (!tasks) continue;
      const maxHours = Math.max(...SHEET_SIZES[slug].map((s) => Number(s.match(/^\d+(\.\d+)?/)?.[0] ?? 0)));
      for (const opt of q.options) {
        for (const subset of allSubsets(tasks.map((t) => t.key))) {
          if (subset.length === 0) continue;
          const size = builderSizeLabel(builderMinutes(slug, subset, opt.factor), SHEET_SIZES[slug]);
          expect(size, `${slug} ×${opt.factor} ${subset.join('+')}`).not.toBeNull();
          const hours = Number((size as string).match(/^\d+(\.\d+)?/)?.[0]);
          expect(hours).toBeGreaterThanOrEqual(1);
          expect(hours).toBeLessThanOrEqual(maxHours);
          expect(hours * 2, 'half-hour steps only').toBe(Math.round(hours * 2));
          expect(getHouseholdPriceCents(slug, size as string), `${slug} / ${size}`).not.toBeNull();
        }
      }
    }
  });

  it('answers are ordered small → large so a bigger answer can only raise the estimate', () => {
    for (const [slug, q] of Object.entries(SIZING_QUESTIONS)) {
      if (!BUILDER_TASKS[slug]) continue;
      const factors = q.options.map((o) => o.factor as number);
      expect([...factors].sort((a, b) => a - b), slug).toEqual(factors);
      // The middle answer is the calibration point — task minutes ARE the
      // typical case, so one option must leave them untouched.
      expect(factors).toContain(1);
    }
  });

  it('the home-size answer visibly moves the price for a typical cleaning tick set', () => {
    // kitchen + bathroom = 75 base minutes: every answer lands on a different
    // rung (€18 / €27 / €36) — the question genuinely re-prices, fairly.
    const cents = SIZING_QUESTIONS.cleaning.options.map((o) =>
      getHouseholdPriceCents(
        'cleaning',
        builderSizeLabel(builderMinutes('cleaning', ['kitchen', 'bathroom'], o.factor), SHEET_SIZES.cleaning) as string,
      ));
    expect(cents).toEqual([1800, 2700, 3600]);
  });

  it('dog answers are info-only (walk prices untouched) and laundry answers are the real bag ladder', () => {
    for (const opt of SIZING_QUESTIONS['dog-walk'].options) {
      expect(opt.factor).toBeUndefined();
      expect(opt.size).toBeUndefined();
      expect(opt.carry).toBeTruthy();
    }
    expect(getHouseholdPriceCents('dog-walk', '30 min')).toBe(1500);
    expect(getHouseholdPriceCents('dog-walk', '1 hour')).toBe(2000);
    // Laundry asks the FULL ladder, in ladder order, using the canonical labels
    expect(SIZING_QUESTIONS.shopping.options.map((o) => o.size)).toEqual(Object.keys(LAUNDRY_BAG_CENTS));
  });

  it('scaledTaskMinutes stays a tidy 5-minute display estimate', () => {
    expect(scaledTaskMinutes(45, 1)).toBe(45);    // factor 1 = the printed estimate
    expect(scaledTaskMinutes(30, 0.75)).toBe(25); // 22.5 → 25, never "~22.5 min"
    expect(scaledTaskMinutes(45, 1.35)).toBe(60); // 60.75 → 60 → "~1 hr"
    expect(scaledTaskMinutes(30, 0.1)).toBe(5);   // floor — a task never reads as 0 min
  });

  it('no answer = factor 1 = exactly the old builder maths (rebooks and deep links unchanged)', () => {
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      for (const subset of allSubsets(tasks.map((t) => t.key))) {
        expect(builderMinutes(slug, subset)).toBe(builderMinutes(slug, subset, 1));
        expect(Number.isInteger(builderMinutes(slug, subset, 1.35))).toBe(true); // whole minutes only
      }
    }
  });
});
