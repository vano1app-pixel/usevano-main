import { describe, it, expect } from 'vitest';

// Autopilot fair-pay floor — an INTERNAL guard only. Nothing here is shown to
// customers; it just stops a future price/time tweak from quietly making a
// visit unfair to pay a helper.
//
// Autopilot pays helpers manually per visit, so the rule is simply: the
// cheapest the customer is ever charged for a weekly visit must still cover the
// helper's pay for that visit's capped time. The cheapest per-visit is monthly
// billing (~10% under weekly) WITH the 3+ service bundle (another −10%); if
// that clears the floor, every other combination (weekly, fewer services) pays
// more, so it's the binding case.
//
// These MUST mirror create-autopilot-checkout SERVICES (monthlyCents) and the
// visit times shown in AutopilotBuilder (mins). If a price drops or a stated
// time grows past what the price can pay, this test fails.

const PAY_FLOOR_CENTS_PER_HOUR = 1415; // Ireland's 2026 wage floor, age 20+
const BUNDLE_FACTOR = 0.9;             // 3+ services → −10%

const SERVICES: Record<string, { monthlyCents: number; mins: number }> = {
  cleaning: { monthlyCents: 11900, mins: 90 },
  laundry:  { monthlyCents:  5900, mins: 45 },
  garden:   { monthlyCents:  5900, mins: 45 },
  dog:      { monthlyCents:  4500, mins: 30 },
  bins:     { monthlyCents:  1900, mins: 10 },
  plants:   { monthlyCents:  1500, mins: 10 },
};

// What a customer pays for one weekly visit at the very cheapest: the monthly
// price, bundled, pro-rated back to a single week (monthly × 12 ÷ 52).
const cheapestPerVisitCents = (monthlyCents: number) =>
  (monthlyCents * BUNDLE_FACTOR * 12) / 52;

const floorForMins = (mins: number) => (PAY_FLOOR_CENTS_PER_HOUR * mins) / 60;

describe('autopilot visits clear the fair-pay floor at the cheapest price (monthly + bundle)', () => {
  for (const [key, { monthlyCents, mins }] of Object.entries(SERVICES)) {
    it(`${key} (${mins} min/visit) still covers fair pay after monthly + 10% bundle`, () => {
      expect(cheapestPerVisitCents(monthlyCents)).toBeGreaterThanOrEqual(floorForMins(mins));
    });
  }

  it('the binding case (cleaning, monthly + bundle) has headroom above the floor', () => {
    const paid = cheapestPerVisitCents(SERVICES.cleaning.monthlyCents); // ≈ 2471.5c
    const floor = floorForMins(SERVICES.cleaning.mins);                  // 2122.5c
    expect(paid).toBeGreaterThan(floor);
    expect(paid - floor).toBeGreaterThan(300); // ≥ €3/visit of room
  });
});
