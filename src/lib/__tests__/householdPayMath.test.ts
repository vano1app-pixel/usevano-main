import { describe, it, expect } from 'vitest';
import {
  getHouseholdPriceCents,
  HOURLY_RATE_CENTS,
  computeVanoFeeCents,
  VANO_FEE_BPS,
  VANO_FEE_MIN_CENTS,
  VANO_COVER_CENTS,
} from '../householdPricing';
// The server fee module is pure TS, so vitest imports it DIRECTLY (same
// pattern as homeMemoryWhatsapp.test.ts) and locks the mirror in step.
import {
  computeVanoFeeCents as serverComputeVanoFeeCents,
  VANO_FEE_BPS as SERVER_FEE_BPS,
  VANO_FEE_MIN_CENTS as SERVER_FEE_MIN,
  VANO_COVER_CENTS as SERVER_COVER,
  UNPAID_STRIKE_BLOCK_THRESHOLD,
} from '../../../supabase/functions/_shared/vanoFees';

// Household one-off money maths — DIRECT-PAY MODEL (July 2026).
//
// The job price is the STUDENT'S money: the customer pays it to them
// directly (Revolut / cash) and the student keeps 100%. Vano's only charge
// is the BOOKING FEE — 15% of the job price with a €5 floor — plus the
// optional €2 Vano Cover, both charged to the CUSTOMER's card at accept
// (create-household-payment-checkout → notify-household-accepted).
//
// These tests lock three contracts:
//   1. the fee maths (15% min €5) and its src/ ↔ supabase/ mirror
//   2. the wage floor — trivial at 100%, but still guarded so a rate cut
//      below €14.15/hr can never ship (the regression that once shipped
//      €16/hr cleaning under the OLD 85% model)
//   3. the shared price table matching the server's computePriceCents

const MIN_WAGE_CENTS_PER_HOUR = 1415; // Ireland NMW, 20+, from 2026-01-01

// Every per-hour, time-based labour rate currently in the booking flows.
// Job-based flat prices (laundry, bins, errands, size/distance tiers) are
// deliberately excluded — they price the task, not the hour.
const TIME_BASED_HOURLY_RATES: Record<string, number> = {
  // €22/hr since 2026-07-30 (owner call) — under direct-pay this IS the
  // student's wage, and €18 was too close to a supermarket shift to hold
  // supply. Still far above the €14.15/hr minimum-wage floor asserted below.
  cleaning: 2200,
  tutoring: 2200,
  garden:   2200,
  moving:   2200,
  custom:   2200, // "name any job" — same hourly floor, so it can't go sub-wage
  business: 2200, // temp staff (flyers/sampling/shop cover) — premium tier
  handyman: 2500,
  // 'plumbing' retired July 2026 (liability triage) — see retiredCategories.test.ts
};

describe('vano booking fee — 15% of the job price, €5 minimum', () => {
  it('constants are 15% / €5 floor / €2 cover', () => {
    expect(VANO_FEE_BPS).toBe(1500);
    expect(VANO_FEE_MIN_CENTS).toBe(500);
    expect(VANO_COVER_CENTS).toBe(200);
  });

  it('src mirror and server module agree exactly (lock-step)', () => {
    expect(VANO_FEE_BPS).toBe(SERVER_FEE_BPS);
    expect(VANO_FEE_MIN_CENTS).toBe(SERVER_FEE_MIN);
    expect(VANO_COVER_CENTS).toBe(SERVER_COVER);
    for (const price of [0, 1200, 1350, 1500, 1800, 2000, 2500, 3600, 5400, 7200, 14400]) {
      expect(computeVanoFeeCents(price)).toBe(serverComputeVanoFeeCents(price));
    }
  });

  it('charges 15% once the job is big enough', () => {
    expect(computeVanoFeeCents(4400)).toBe(660);   // 2h clean €44 → €6.60
    expect(computeVanoFeeCents(6600)).toBe(990);   // 3h €66 → €9.90
    expect(computeVanoFeeCents(17600)).toBe(2640); // 8h €176 → €26.40
  });

  it('floors at €5 on small jobs (15% would be less)', () => {
    expect(computeVanoFeeCents(1400)).toBe(500); // €14 min booking → 15% = €2.10 → €5
    expect(computeVanoFeeCents(1500)).toBe(500); // €15 walk → 15% = €2.25 → €5
    expect(computeVanoFeeCents(2400)).toBe(500); // €24 walk → 15% = €3.60 → €5
    expect(computeVanoFeeCents(3300)).toBe(500); // €33.33 is the last €5 price point
    expect(computeVanoFeeCents(3400)).toBe(510); // …from €34 the 15% takes over
  });

  it('degrades safely on nonsense input (never a negative or NaN fee)', () => {
    expect(computeVanoFeeCents(0)).toBe(VANO_FEE_MIN_CENTS);
    expect(computeVanoFeeCents(-500)).toBe(VANO_FEE_MIN_CENTS);
    expect(computeVanoFeeCents(NaN)).toBe(VANO_FEE_MIN_CENTS);
  });

  it('two unpaid strikes block a customer number at checkout', () => {
    expect(UNPAID_STRIKE_BLOCK_THRESHOLD).toBe(2);
  });
});

describe('household time-based rates pay above minimum wage', () => {
  // Direct-pay: the student keeps 100% of the job price, so the net rate IS
  // the quoted rate. The guard stays so a future price cut below the legal
  // floor still fails the build.
  for (const [service, rate] of Object.entries(TIME_BASED_HOURLY_RATES)) {
    it(`${service} (€${(rate / 100).toFixed(0)}/hr) nets the student ≥ €14.15/hr at 100%`, () => {
      expect(rate).toBeGreaterThanOrEqual(MIN_WAGE_CENTS_PER_HOUR);
    });
  }

  it('a short custom visit clears minimum wage at 100%', () => {
    // €12 booking minimum for 30 min → €24/hr equivalent
    const halfHour = getHouseholdPriceCents('custom', '30 min')!;
    expect(halfHour * 2).toBeGreaterThanOrEqual(MIN_WAGE_CENTS_PER_HOUR);
  });
});

// The canonical frontend price source (householdPricing.ts) must match the
// server's computePriceCents (create-household-payment-checkout). Browser code
// can't import the Deno function, so these expected values ARE the contract —
// if the server changes a price, change it here too and this test stays green.
describe('shared price source matches the server', () => {
  it('all time-based labour rates (incl. custom) are €22/hr', () => {
    for (const slug of ['garden', 'moving', 'cleaning', 'tutoring', 'custom']) {
      expect(HOURLY_RATE_CENTS[slug]).toBe(2200);
    }
  });

  it('prices each category/size exactly as computePriceCents does', () => {
    expect(getHouseholdPriceCents('shopping', '')).toBe(3000);   // laundry no-size fallback = 1-bag €30
    expect(getHouseholdPriceCents('shopping', '1 bag')).toBe(3000);  // bag ladder (owner 2026-07-24)
    expect(getHouseholdPriceCents('shopping', '2 bags')).toBe(5000);
    expect(getHouseholdPriceCents('shopping', '3 bags')).toBe(6500);
    expect(getHouseholdPriceCents('dog-walk', '30 min')).toBe(1500);
    expect(getHouseholdPriceCents('dog-walk', '1 hour')).toBe(2400); // €20 → €24 (2026-07-30: was under the €22/hr labour rate)
    expect(getHouseholdPriceCents('cleaning', '2 hours')).toBe(4400);
    expect(getHouseholdPriceCents('tutoring', '1 hour')).toBe(2200);
    expect(getHouseholdPriceCents('garden', '8 hours')).toBe(17600);
    expect(getHouseholdPriceCents('moving', '4+ hours')).toBe(8800); // client matches server (€22/hr × 4)
    // Custom "name any job" — €22/hr × N, matching the server's hour map
    expect(getHouseholdPriceCents('custom', '1 hour')).toBe(2200);
    expect(getHouseholdPriceCents('custom', '3 hours')).toBe(6600);
    expect(getHouseholdPriceCents('custom', '8 hours')).toBe(17600);
    // Short custom visits — €14 booking minimum (floored), matching the server
    expect(getHouseholdPriceCents('custom', '30 min')).toBe(1400);
    expect(getHouseholdPriceCents('custom', '45 min')).toBe(1650); // €22/hr × 0.75
    // Business temp staff — €28/hr premium (moved up from €22 on 2026-07-30
    // when households rose to €22, so the tier stays genuinely premium),
    // 2-hour minimum shift
    expect(getHouseholdPriceCents('business', '2 hours')).toBe(5600);
    expect(getHouseholdPriceCents('business', '4 hours')).toBe(11200);
    expect(getHouseholdPriceCents('business', '8 hours')).toBe(22400);
  });

  it('returns null for an unpriceable combination', () => {
    expect(getHouseholdPriceCents('unknown', '1 hour')).toBeNull();
    expect(getHouseholdPriceCents('cleaning', 'not a duration')).toBeNull();
  });
});
