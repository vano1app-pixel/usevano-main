import { describe, it, expect } from 'vitest';
import { getHouseholdPriceCents, HOURLY_RATE_CENTS } from '../householdPricing';

// Household one-off pricing — the wage floor that justifies each TIME-BASED
// hourly rate. A student is paid (price − 15% platform cut) at completion
// (PLATFORM_FEE_BPS = 1500 in capture-household-payment); the customer also
// pays a 7.5% service fee on top (create-household-payment-checkout). This
// test locks in the rule that every per-hour labour rate must still net the
// student at or above Ireland's 2026 minimum wage after the cut.
//
// These rates MUST mirror getPriceCents (CategoryGrid.tsx) and
// computePriceCents (create-household-payment-checkout). If a rate drops below
// the wage floor this test fails — which is exactly the regression that once
// shipped €16/hr cleaning and €15/hr tutoring under minimum wage.
//
// INVARIANT (learned the hard way): a customer discount must NEVER reduce the
// student's payout base (price_estimate_cents). The old book-ahead (−10%) and
// loyalty (−50%) discounts cut that value, paying students as little as
// €7.65/hr — under min wage — yet this test stayed green because it only
// checks the undiscounted base rates. Both were removed; any future customer
// discount must be a Stripe coupon on the checkout session (like the referral
// credit), applied AFTER the student's pay is fixed — never a cut to priceCents.

const PLATFORM_FEE_BPS = 1500;        // student-side cut, capture-household-payment
const SERVICE_FEE_BPS = 750;          // customer-side fee, create-household-payment-checkout
const MIN_WAGE_CENTS_PER_HOUR = 1415; // Ireland NMW, 20+, from 2026-01-01

const netToStudentPerHour = (rateCents: number) =>
  Math.floor((rateCents * (10000 - PLATFORM_FEE_BPS)) / 10000);

// Every per-hour, time-based labour rate currently in the booking flows.
// Job-based flat prices (laundry, bins, errands, size/distance tiers) are
// deliberately excluded — they price the task, not the hour.
const TIME_BASED_HOURLY_RATES: Record<string, number> = {
  cleaning: 1800,
  tutoring: 1800,
  garden:   1800,
  moving:   1800,
  handyman: 2500,
  plumbing: 3000,
};

describe('household time-based rates pay above minimum wage', () => {
  for (const [service, rate] of Object.entries(TIME_BASED_HOURLY_RATES)) {
    it(`${service} (€${(rate / 100).toFixed(0)}/hr) nets the student ≥ €14.15/hr after the 15% cut`, () => {
      expect(netToStudentPerHour(rate)).toBeGreaterThanOrEqual(MIN_WAGE_CENTS_PER_HOUR);
    });
  }

  it('€18/hr is the floor — €18 clears, the old €16 and €15 rates do not', () => {
    expect(netToStudentPerHour(1800)).toBe(1530); // ≥ 1415 ✓
    expect(netToStudentPerHour(1600)).toBe(1360); // < 1415 — the old cleaning bug
    expect(netToStudentPerHour(1500)).toBe(1275); // < 1415 — the old tutoring bug
  });

  it('combined Vano take on a time-based job is ~22.5% of the quoted price', () => {
    const rate = 1800;
    const customerPays = rate + Math.round((rate * SERVICE_FEE_BPS) / 10000); // +7.5%
    const studentGets = netToStudentPerHour(rate);                            // −15%
    const vanoTake = customerPays - studentGets;
    expect(customerPays).toBe(1935);
    expect(studentGets).toBe(1530);
    expect(vanoTake).toBe(405);
    expect(vanoTake / rate).toBeCloseTo(0.225, 3);
  });
});

// The canonical frontend price source (householdPricing.ts) must match the
// server's computePriceCents (create-household-payment-checkout). Browser code
// can't import the Deno function, so these expected values ARE the contract —
// if the server changes a price, change it here too and this test stays green.
describe('shared price source matches the server', () => {
  it('all four time-based labour rates are €18/hr', () => {
    for (const slug of ['garden', 'moving', 'cleaning', 'tutoring']) {
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
  });

  it('returns null for an unpriceable combination', () => {
    expect(getHouseholdPriceCents('unknown', '1 hour')).toBeNull();
    expect(getHouseholdPriceCents('cleaning', 'not a duration')).toBeNull();
  });
});
