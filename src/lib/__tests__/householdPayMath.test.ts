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
// is the BOOKING FEE — 15% of the job price with a €4 floor — plus the
// optional €2 Vano Cover, both charged to the CUSTOMER's card at accept
// (create-household-payment-checkout → notify-household-accepted).
//
// These tests lock three contracts:
//   1. the fee maths (15% min €4) and its src/ ↔ supabase/ mirror
//   2. the wage floor — trivial at 100%, but still guarded so a rate cut
//      below €14.15/hr can never ship (the regression that once shipped
//      €16/hr cleaning under the OLD 85% model)
//   3. the shared price table matching the server's computePriceCents

const MIN_WAGE_CENTS_PER_HOUR = 1415; // Ireland NMW, 20+, from 2026-01-01

// Every per-hour, time-based labour rate currently in the booking flows.
// Job-based flat prices (laundry, bins, errands, size/distance tiers) are
// deliberately excluded — they price the task, not the hour.
const TIME_BASED_HOURLY_RATES: Record<string, number> = {
  cleaning: 1800,
  tutoring: 1800,
  garden:   1800,
  moving:   1800,
  custom:   1800, // "name any job" — same hourly floor, so it can't go sub-wage
  handyman: 2500,
  // 'plumbing' retired July 2026 (liability triage) — see retiredCategories.test.ts
};

describe('vano booking fee — 15% of the job price, €4 minimum', () => {
  it('constants are 15% / €4 floor / €2 cover', () => {
    expect(VANO_FEE_BPS).toBe(1500);
    expect(VANO_FEE_MIN_CENTS).toBe(400);
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
    expect(computeVanoFeeCents(3600)).toBe(540);   // 2h clean €36 → €5.40
    expect(computeVanoFeeCents(5400)).toBe(810);   // 3h €54 → €8.10
    expect(computeVanoFeeCents(14400)).toBe(2160); // 8h €144 → €21.60
  });

  it('floors at €4 on small jobs (15% would be less)', () => {
    expect(computeVanoFeeCents(1200)).toBe(400); // €12 min booking → 15% = €1.80 → €4
    expect(computeVanoFeeCents(1500)).toBe(400); // €15 laundry/walk → 15% = €2.25 → €4
    expect(computeVanoFeeCents(2000)).toBe(400); // €20 walk → 15% = €3 → €4
    expect(computeVanoFeeCents(2600)).toBe(400); // €26.66 is the last €4 price point
    expect(computeVanoFeeCents(2700)).toBe(405); // …from €27 the 15% takes over
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
  it('all time-based labour rates (incl. custom) are €18/hr', () => {
    for (const slug of ['garden', 'moving', 'cleaning', 'tutoring', 'custom']) {
      expect(HOURLY_RATE_CENTS[slug]).toBe(1800);
    }
  });

  it('prices each category/size exactly as computePriceCents does', () => {
    expect(getHouseholdPriceCents('shopping', '')).toBe(1500);   // flat laundry
    expect(getHouseholdPriceCents('dog-walk', '30 min')).toBe(1500);
    expect(getHouseholdPriceCents('dog-walk', '1 hour')).toBe(2000);
    expect(getHouseholdPriceCents('cleaning', '2 hours')).toBe(3600);
    expect(getHouseholdPriceCents('tutoring', '1 hour')).toBe(1800);
    expect(getHouseholdPriceCents('garden', '8 hours')).toBe(14400);
    expect(getHouseholdPriceCents('moving', '4+ hours')).toBe(7200); // client now matches server
    // Custom "name any job" — €18/hr × N, matching the server's hour map
    expect(getHouseholdPriceCents('custom', '1 hour')).toBe(1800);
    expect(getHouseholdPriceCents('custom', '3 hours')).toBe(5400);
    expect(getHouseholdPriceCents('custom', '8 hours')).toBe(14400);
    // Short custom visits — €12 booking minimum (floored), matching the server
    expect(getHouseholdPriceCents('custom', '30 min')).toBe(1200);
    expect(getHouseholdPriceCents('custom', '45 min')).toBe(1350);
  });

  it('returns null for an unpriceable combination', () => {
    expect(getHouseholdPriceCents('unknown', '1 hour')).toBeNull();
    expect(getHouseholdPriceCents('cleaning', 'not a duration')).toBeNull();
  });
});
