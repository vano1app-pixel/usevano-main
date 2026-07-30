import { describe, expect, it } from 'vitest';
import {
  BILLING_STEP_MINUTES,
  BUILDER_MARKET_RATE_CENTS,
  BUILDER_TASKS,
  EQUIPMENT_QUESTIONS,
  MIN_BOOKING_MINUTES,
  SIZING_QUESTIONS,
  bookedMinutes,
  builderMarketCents,
  builderMinutes,
  builderNote,
  builderShortLabel,
  builderSizeLabel,
  durationText,
  minutesText,
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
  it('covers exactly the hourly categories the sheet prices at €22/hr', () => {
    for (const slug of Object.keys(BUILDER_TASKS)) {
      expect(SHEET_SIZES[slug], `${slug} needs a SHEET_SIZES entry`).toBeDefined();
      expect(HOURLY_RATE_CENTS[slug]).toBe(2200);
    }
  });

  it('every possible tick combination computes a priceable quarter-hour size within the category cap', () => {
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
        expect(hours * 4, 'quarter-hour steps only').toBe(Math.round(hours * 4));
        expect(getHouseholdPriceCents(slug, size as string), `${slug} / ${size}`).not.toBeNull();
      }
    }
  });

  it('the billed minutes are exactly the per-row estimates the customer can read off the screen', () => {
    // The 2026-07-30 report started here: the rows said ~35 + ~25 while the
    // maths billed round((45+30) × 0.75) = 56. Anyone adding up the screen got
    // a different number to the one they were charged for. Now they match.
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      const factors = SIZING_QUESTIONS[slug]?.options.map((o) => o.factor as number) ?? [1];
      for (const factor of factors) {
        for (const subset of allSubsets(tasks.map((t) => t.key))) {
          const onScreen = subset.reduce(
            (sum, k) => sum + scaledTaskMinutes(tasks.find((t) => t.key === k)!.minutes, factor), 0);
          expect(builderMinutes(slug, subset, factor), `${slug} ×${factor} ${subset.join('+')}`).toBe(onScreen);
        }
      }
    }
  });

  it('rounds minutes UP in quarter-hour steps and caps at the biggest label', () => {
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
    // — the hourly rate only nets that rate if the hours are real. Rounding UP grows the
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
    expect(price(['kitchen', 'bathroom'])).toBe(2750);                        // 75 min → 1.25h @ €22
    expect(price(['kitchen', 'bathroom', 'bedrooms'])).toBe(4400);            // 120 min → 2h @ €22
    expect(price(['kitchen', 'bathroom', 'bedrooms', 'floors'])).toBe(5500);  // 150 min → 2.5h @ €22
  });

  // THE TEST THAT SHOULD HAVE EXISTED. The 2026-07-27 version above checked
  // three hand-picked cleaning sets at factor 1 and passed happily while the
  // owner's actual screen (2026-07-30: "I've clicked two, same price") showed
  // kitchen and kitchen+bathroom BOTH at €22 — because they were at the small
  // home factor, which the hand-picked cases never touched. This one
  // enumerates EVERY subset × EVERY task-you-could-add-next × EVERY sizing
  // answer, in every builder category. It cannot be satisfied by luck.
  it('MONOTONIC-TICK INVARIANT: adding any tick raises the price — every category, every sizing answer', () => {
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      const sizes = SHEET_SIZES[slug];
      const capMinutes = Math.max(...sizes.map((s) => Number(s.match(/^\d+(\.\d+)?/)?.[0] ?? 0))) * 60;
      const factors = SIZING_QUESTIONS[slug]?.options.map((o) => o.factor as number) ?? [1];
      const keys = tasks.map((t) => t.key);
      let floorTies = 0;
      for (const factor of factors) {
        for (const subset of allSubsets(keys)) {
          for (const next of keys.filter((k) => !subset.includes(k))) {
            const grown = [...subset, next];
            const estBefore = builderMinutes(slug, subset, factor);
            const estAfter = builderMinutes(slug, grown, factor);
            const before = subset.length
              ? getHouseholdPriceCents(slug, builderSizeLabel(estBefore, sizes) as string) as number
              : 0;
            const after = getHouseholdPriceCents(slug, builderSizeLabel(estAfter, sizes) as string) as number;
            const where = `${slug} ×${factor} [${subset.join('+') || 'nothing'}] + ${next}`;
            // The ONE honest exception: both sides still fit inside the
            // 1-hour minimum, so the customer is buying the same hour. The
            // build-up card says so out loud ("~25 min spare — tick more,
            // it's included"), which is what makes it a deal and not a bug.
            if (estAfter <= MIN_BOOKING_MINUTES) {
              // Both sides are the 1-hour minimum, at the minimum's price.
              expect(after, where).toBe(getHouseholdPriceCents(slug, '1 hour'));
              if (subset.length) expect(before, where).toBe(after);
              floorTies++;
              continue;
            }
            // …and the cap, which no honest estimate currently reaches.
            expect(estAfter, `${where} would be truncated by the ${capMinutes}m cap`)
              .toBeLessThanOrEqual(capMinutes);
            expect(after, `${where}: €${before / 100} → €${after / 100}`).toBeGreaterThan(before);
          }
        }
      }
      // Sanity: the exception is a narrow doorway, not a barn door. If a
      // refactor ever let most combinations fall through it, this trips.
      expect(floorTies, `${slug}: too many ties hiding behind the 1-hour floor`)
        .toBeLessThan(factors.length * 2 ** keys.length);
    }
  });

  it('the owner’s exact 2026-07-30 screen now prices differently for one tick vs two', () => {
    // Small home (factor 0.75) — the case in the screenshot. Kitchen alone is
    // 35 min and floors to the 1-hour minimum; adding the bathroom fills that
    // hour exactly (60 min), so it is STILL the same hour — but the card now
    // says "~25 min spare, tick more, it's included" instead of silently
    // repeating €22. A third tick is where the price has to move, and does.
    const sizes = SHEET_SIZES.cleaning;
    const est = (keys: string[]) => builderMinutes('cleaning', keys, 0.75);
    const price = (keys: string[]) =>
      getHouseholdPriceCents('cleaning', builderSizeLabel(est(keys), sizes) as string);
    expect(est(['kitchen'])).toBe(35);
    expect(est(['kitchen', 'bathroom'])).toBe(60);            // exactly the hour they already bought
    expect(est(['kitchen', 'bathroom', 'bedrooms'])).toBe(95);
    expect(price(['kitchen'])).toBe(2200);
    expect(price(['kitchen', 'bathroom'])).toBe(2200);        // same hour, and the card says why
    expect(price(['kitchen', 'bathroom', 'bedrooms'])).toBe(3850);   // 95 min → 1.75 h @ €22
    // And the pair that used to collide ABOVE the floor (5 vs 6 ticks at the
    // small-home factor both booked 3 hours under half-hour steps).
    const five = ['kitchen', 'bathroom', 'bedrooms', 'floors', 'oven'];
    expect(price(five)).toBeLessThan(price([...five, 'windows']) as number);
  });

  it('market anchors stay display-only, conservative, and above the €22/hr rate', () => {
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
          expect(hours * 4, 'quarter-hour steps only').toBe(Math.round(hours * 4));
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
    // rung (€22 / €27.50 / €38.50) — the question genuinely re-prices, fairly.
    const cents = SIZING_QUESTIONS.cleaning.options.map((o) =>
      getHouseholdPriceCents(
        'cleaning',
        builderSizeLabel(builderMinutes('cleaning', ['kitchen', 'bathroom'], o.factor), SHEET_SIZES.cleaning) as string,
      ));
    expect(cents).toEqual([2200, 2750, 3850]);
    // …and never downwards: a bigger home can only cost the same or more.
    expect([...cents].sort((a, b) => (a as number) - (b as number))).toEqual(cents);
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
    expect(ladder('1 hour')).toEqual([2400, 2400, 2700, 2900]); // base €24 since 2026-07-30
    // Small/Medium ARE the old base prices — the ladder never discounts.
    expect(getHouseholdPriceCents('dog-walk', '30 min')).toBe(1500);
    expect(getHouseholdPriceCents('dog-walk', '1 hour')).toBe(2400);
  });

  it('laundry answers are the real bag ladder, in ladder order, on the canonical labels', () => {
    expect(SIZING_QUESTIONS.shopping.options.map((o) => o.size)).toEqual(Object.keys(LAUNDRY_BAG_CENTS));
  });

  it('quarter-hour labels stay numeric for the parsers and human on screen', () => {
    // The stored/priced label must keep a leading decimal — every parser in
    // the codebase reads one — while the SCREEN never says "1.25 hours".
    expect(BILLING_STEP_MINUTES).toBe(15);
    expect(MIN_BOOKING_MINUTES).toBe(60);
    expect(durationText('1 hour')).toBe('1 hr');
    expect(durationText('1.25 hours')).toBe('1 hr 15 min');
    expect(durationText('2.5 hours')).toBe('2 hrs 30 min');
    expect(durationText('4 hours')).toBe('4 hrs');
    expect(durationText('4+ hours')).toBe('4 hrs');
    expect(durationText('30 min')).toBe('30 min');
    // Not a duration → returned untouched. These two are reached from generic
    // UI, so "2 bags" must never render as "2 hrs".
    expect(durationText('2 bags')).toBe('2 bags');
    expect(durationText('Small area')).toBe('Small area');
    expect(bookedMinutes('1.75 hours')).toBe(105);
    expect(bookedMinutes('30 min')).toBe(30);
    expect(bookedMinutes('1 bag')).toBeNull();
    expect(bookedMinutes('Medium (semi-detached)')).toBeNull();
    expect(minutesText(35)).toBe('35 min');
    expect(minutesText(60)).toBe('1 hr');
    expect(minutesText(95)).toBe('1 hr 35 min');
    expect(minutesText(0)).toBe('0 min');
    // Every label the builder can compute renders as words, in both categories.
    for (const [slug, tasks] of Object.entries(BUILDER_TASKS)) {
      const factors = SIZING_QUESTIONS[slug]?.options.map((o) => o.factor as number) ?? [1];
      for (const factor of factors) {
        for (const subset of allSubsets(tasks.map((t) => t.key))) {
          if (!subset.length) continue;
          const size = builderSizeLabel(builderMinutes(slug, subset, factor), SHEET_SIZES[slug]) as string;
          expect(durationText(size), size).toMatch(/^\d+ hrs?( \d+ min)?$/);
        }
      }
    }
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
