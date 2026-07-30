import { describe, expect, it } from 'vitest';
import {
  BUILDER_MARKET_RATE_CENTS,
  BUILDER_TASKS,
  EQUIPMENT_QUESTIONS,
  SIZING_QUESTIONS,
  builderMarketCents,
  builderMinutes,
  builderNote,
  builderShortLabel,
  builderSizeLabel,
  scaledTaskMinutes,
} from '../jobBuilder';
import {
  DOG_UPCHARGE_CENTS, HOURLY_RATE_CENTS, LAUNDRY_BAG_CENTS, getHouseholdPriceCents,
  SUPPLIES_ADDON_CENTS, travelTopupCents,
  TRAVEL_TOPUP_NEAR_CENTS, TRAVEL_TOPUP_FAR_CENTS, GALWAY_CENTRE,
} from '../householdPricing';
// The REAL server table (pure TS, no Deno APIs) — the dog surcharge is priced
// server-side off extra_label, so the ladder is cross-checked on actual code.
import {
  computePriceCents,
  SUPPLIES_ADDON_CENTS as SERVER_SUPPLIES_ADDON_CENTS,
  travelTopupCents as serverTravelTopupCents,
  GALWAY_CENTRE as SERVER_GALWAY_CENTRE,
} from '../../../supabase/functions/_shared/householdPricing';

// The size chips each builder category offers in CategoryGrid. Kept in
// lock-step by hand (the arrays live inside the component) — if the sheet's
// sizes change, this test is the tripwire that the builder still rounds to
// labels the sheet and server actually price.
const SHEET_SIZES: Record<string, string[]> = {
  cleaning: ['1 hour', '2 hours', '3 hours', '4 hours', '5 hours', '6 hours'], // cap 3h → 6h 2026-07-27 (suitable-money rule + the condition tick)
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
    // All SEVEN cleaning ticks (six tasks + the extra-messy condition) = 4h
    // and book exactly that — the booked time covers the ticked work.
    const allCleaning = BUILDER_TASKS.cleaning.map((t) => t.key);
    expect(builderSizeLabel(builderMinutes('cleaning', allCleaning), SHEET_SIZES.cleaning)).toBe('4 hours');
    // The biggest possible cleaning ask (4+ bed, everything, extra messy)
    // books 5.5h — the cap exists but sits ABOVE every honest estimate.
    expect(builderSizeLabel(builderMinutes('cleaning', allCleaning, 1.35), SHEET_SIZES.cleaning)).toBe('5.5 hours');
  });

  it('SUITABLE-MONEY INVARIANT: the booked time always covers the estimated work (owner rule 2026-07-27)', () => {
    // A student must never be booked for less time than the ticks add up to
    // — €18/hr only nets €18/hr if the hours are real. Rounding UP grows the
    // booking; the only way to violate this is a category cap below the
    // biggest honest estimate (exactly the old cleaning-3h bug). Enumerates
    // every subset × every sizing factor (and factor 1 for wizard-less cats).
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      const factors = SIZING_QUESTIONS[slug]?.options.map((o) => o.factor as number) ?? [1];
      for (const factor of factors) {
        for (const subset of allSubsets(tasks.map((t) => t.key))) {
          if (subset.length === 0) continue;
          const minutes = builderMinutes(slug, subset, factor);
          const size = builderSizeLabel(minutes, SHEET_SIZES[slug]) as string;
          const bookedMinutes = Number(size.match(/^\d+(\.\d+)?/)?.[0]) * 60;
          expect(bookedMinutes, `${slug} ×${factor} ${subset.join('+')} estimates ${minutes}m but books ${bookedMinutes}m`)
            .toBeGreaterThanOrEqual(minutes);
        }
      }
    }
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

  it('the dog ladder prices identically on BOTH tables and only ever climbs (owner call: bigger dog costs more)', () => {
    const opts = SIZING_QUESTIONS['dog-walk'].options;
    // Every carry has a surcharge entry and vice versa — the three sources
    // (question carries, frontend display map, server table) cannot drift.
    expect(opts.map((o) => o.carry)).toEqual(Object.keys(DOG_UPCHARGE_CENTS));
    for (const dur of ['30 min', '1 hour']) {
      const base = getHouseholdPriceCents('dog-walk', dur) as number;
      // No answer (WhatsApp door, memory rebooks, old links) = base, fail-soft
      expect(computePriceCents('dog-walk', dur, '')).toBe(base);
      expect(computePriceCents('dog-walk', dur, 'not-a-dog-label')).toBe(base);
      let prev = base;
      for (const opt of opts) {
        const front = getHouseholdPriceCents('dog-walk', dur, opt.carry) as number;
        expect(front, `${dur} / ${opt.carry}`).toBe(computePriceCents('dog-walk', dur, opt.carry as string));
        expect(front).toBeGreaterThanOrEqual(prev); // small → two dogs only climbs
        prev = front;
      }
      expect(prev).toBeGreaterThan(base); // …and genuinely moves by the top
    }
    // The exact sheet ladder (owner call 2026-07-27): base / base / +€3 / +€5.
    const ladder = (dur: string) => opts.map((o) => getHouseholdPriceCents('dog-walk', dur, o.carry));
    expect(ladder('30 min')).toEqual([1500, 1500, 1800, 2000]);
    expect(ladder('1 hour')).toEqual([2000, 2000, 2300, 2500]);
    // Small/Medium ARE the old base prices — the ladder never discounts.
    expect(getHouseholdPriceCents('dog-walk', '30 min')).toBe(1500);
    expect(getHouseholdPriceCents('dog-walk', '1 hour')).toBe(2000);
  });

  it('laundry answers are the real bag ladder, in ladder order, on the canonical labels', () => {
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

// ── The equipment question + its money surfaces (2026-07-30) ──────────────
describe('equipment question — carries ride the note, add-ons stay in lock-step', () => {
  it('every option has a non-empty carry and key', () => {
    for (const [slug, q] of Object.entries(EQUIPMENT_QUESTIONS)) {
      expect(q.title.length, slug).toBeGreaterThan(0);
      expect(q.options.length, slug).toBeGreaterThanOrEqual(2);
      for (const o of q.options) {
        expect(o.key.length, `${slug}/${o.key}`).toBeGreaterThan(0);
        expect(o.carry.trim().length, `${slug}/${o.key} carry`).toBeGreaterThan(0);
      }
    }
  });

  it('the supplies add-on exists ONLY on cleaning, exactly once, and the two price tables agree', () => {
    for (const [slug, q] of Object.entries(EQUIPMENT_QUESTIONS)) {
      const addons = q.options.filter((o) => o.suppliesAddon);
      expect(addons.length, slug).toBe(slug === 'cleaning' ? 1 : 0);
    }
    expect(SUPPLIES_ADDON_CENTS).toBe(SERVER_SUPPLIES_ADDON_CENTS);
    expect(SUPPLIES_ADDON_CENTS).toBeGreaterThan(0);
  });
});

// ── Travel top-up (2026-07-30) — display mirror ↔ server charge lock-step ──
describe('travel top-up — the two modules can never disagree', () => {
  const SAMPLES: Array<[number, number, string]> = [
    [53.2745, -9.0491, 'Eyre Square'],
    [53.2607, -9.0800, 'Salthill'],
    [53.2836, -9.0453, 'Terryland'],
    [53.2690, -8.9210, 'Oranmore'],
    [53.3306, -8.9464, 'Claregalway'],
    [53.3025, -8.7440, 'Athenry'],
    [53.3498, -6.2603, 'Dublin (bad geocode, > sanity ceiling)'],
  ];

  it('client mirror and server charge produce the same cents everywhere', () => {
    expect(GALWAY_CENTRE).toEqual(SERVER_GALWAY_CENTRE);
    for (const [lat, lng, label] of SAMPLES) {
      expect(travelTopupCents(lat, lng), label).toBe(serverTravelTopupCents(lat, lng));
    }
    // No coords / junk coords = no top-up — geography can never 400 a booking.
    expect(serverTravelTopupCents(null, null)).toBe(0);
    expect(serverTravelTopupCents(NaN, 1)).toBe(0);
  });

  it('the ladder shape holds: free in town, near-ring, far-ring, ceiling', () => {
    expect(travelTopupCents(53.2745, -9.0491)).toBe(0); // Eyre Square
    expect(travelTopupCents(53.2607, -9.0800)).toBe(0); // Salthill — in town, never surcharged
    expect(travelTopupCents(53.2690, -8.9210)).toBe(TRAVEL_TOPUP_NEAR_CENTS); // Oranmore
    expect(travelTopupCents(53.3025, -8.7440)).toBe(TRAVEL_TOPUP_FAR_CENTS);  // Athenry
    expect(travelTopupCents(53.3498, -6.2603)).toBe(0); // Dublin = bad geocode → 0
  });
});
