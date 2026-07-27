// Single source of truth for VANO one-off household prices on the frontend.
// CategoryGrid (the quick-book sheet) and PricingTable both read from here, so
// a price can never be advertised in one place and charged in another — the
// drift that used to require editing the same number in six files.
//
// The SERVER re-prices authoritatively in
// supabase/functions/create-household-payment-checkout (computePriceCents).
// Browser code can't import a Deno edge function, so the two are kept in
// lock-step by src/lib/__tests__/householdPayMath.test.ts, which fails if a
// time-based rate here drifts below minimum wage or away from the server.

/**
 * Per-hour rate for TIME-BASED labour, in cents (quoted as €X/hr × N hours).
 * Household rates sit at €18/hr so a student nets ≥ €14.15/hr after the 15% cut.
 *
 * `custom` is the catch-all "name any job" rate: because it's priced by the
 * hour at the same €18/hr floor, a custom job can never undercut minimum wage,
 * whatever the task. The market-comparison figures shown next to it in the
 * CustomJobBuilder are display-only and never charged.
 *
 * `business` (owner test, 2026-07-23) is the temp-staff tier — flyer runs,
 * sampling, events, shop cover — priced at a PREMIUM €22/hr: businesses pay
 * agency-style money, the student keeps 100% of the bigger rate, and Vano's
 * 15% fee rides on the bigger ticket. 2-hour minimum shift (see CategoryGrid
 * sizes — there's no '1 hour' option).
 */
export const HOURLY_RATE_CENTS: Record<string, number> = {
  garden:   1800,
  moving:   1800,
  cleaning: 1800,
  tutoring: 1800,
  custom:   1800,
  business: 2200,
};

/** Flat, JOB-BASED prices (one price for the task done), in cents. */
export const FLAT_PRICE_CENTS: Record<string, number> = {
  shopping: 3000, // Laundry 1-bag baseline — also the no-size fallback (see LAUNDRY_BAG_CENTS)
};

/**
 * Laundry — priced per BAG, not per hour (owner ladder 2026-07-24:
 * €30 / €50 / €65 for 1 / 2 / 3 bags; the machine does the hours, so the
 * task is the honest unit). Unknown/no size falls back to the 1-bag €30 —
 * memory rebooks, old links and the WhatsApp door (which never asks laundry
 * a size) all keep pricing. MUST mirror the 'shopping' branch in
 * supabase/functions/_shared/householdPricing.ts — homeMemoryWhatsapp.test
 * cross-checks the two.
 */
export const LAUNDRY_BAG_CENTS: Record<string, number> = {
  '1 bag':  3000,
  '2 bags': 5000,
  '3 bags': 6500,
};

/** Leading hour count from a size label ("2 hours", "1.5 hours", "4+ hours")
 *  → 1–8 (halves allowed — the job builder bills in half-hour steps since
 *  2026-07-27) or null. */
function hoursFromLabel(size: string): number | null {
  const n = Number(size.match(/^\d+(\.\d+)?/)?.[0]);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : null;
}

/**
 * Price for a one-off booking in cents, or null if the combination isn't
 * priceable. Mirrors computePriceCents for the categories the quick-book
 * sheet offers (dog walk is a flat 30-min / 1-hour walk, not an hourly rate).
 */
/**
 * Booking minimum (cents) for short custom visits. €18/hr × 0.5 = €9 would be
 * too small to be worth a student's trip, so a half-hour job is floored to
 * €12. Direct-pay: the student keeps 100% (€12 for 30 min = €24/hr), well
 * clear of minimum wage. Mirrors the server's custom hour map.
 */
export const MIN_BOOKING_CENTS = 1200;

export function getHouseholdPriceCents(slug: string, size: string): number | null {
  if (slug === 'shopping') return LAUNDRY_BAG_CENTS[size] ?? FLAT_PRICE_CENTS.shopping;
  if (slug in FLAT_PRICE_CENTS) return FLAT_PRICE_CENTS[slug];
  if (slug === 'dog-walk') return size === '30 min' ? 1500 : 2000;
  // Custom "name any job" supports short half-/three-quarter-hour visits for
  // quick jobs (dog walk, bins, key-drop…), floored at the booking minimum.
  if (slug === 'custom') {
    if (size === '30 min') return MIN_BOOKING_CENTS;                 // €18/hr × 0.5 = €9 → floored to €12
    if (size === '45 min') return Math.max(1350, MIN_BOOKING_CENTS); // €18/hr × 0.75 = €13.50
  }
  const rate = HOURLY_RATE_CENTS[slug];
  if (rate) {
    const hours = hoursFromLabel(size);
    // Business has a 2-hour MINIMUM shift — the server refuses '1 hour', so
    // the frontend must never price it either (the tables stay in lock-step).
    if (slug === 'business' && hours != null && hours < 2) return null;
    if (hours) return rate * hours;
  }
  return null;
}

/** "from €X/hr" summary for the marketing PricingTable; null if not hourly. */
export function hourlyRateLabel(slug: string): string | null {
  const rate = HOURLY_RATE_CENTS[slug];
  return rate ? `from €${rate / 100}/hr` : null;
}

// ── Direct-pay model (July 2026) ──────────────────────────────────────────
// Vano never holds the job money: the customer pays the STUDENT directly
// (Revolut / cash) and the student keeps 100% of the job price. Vano's card
// charge is ONLY the booking fee below (+ the optional €2 Vano Cover), taken
// when a helper accepts. Mirrors supabase/functions/_shared/vanoFees.ts —
// householdPayMath.test.ts keeps the two in lock-step.

/** Customer-side booking fee: 15% of the job price, floored at €4. */
export const VANO_FEE_BPS = 1500;
export const VANO_FEE_MIN_CENTS = 400;
/** Optional Vano Cover add-on (accidental damage up to €250) — flat €2. */
export const VANO_COVER_CENTS = 200;

export function computeVanoFeeCents(jobPriceCents: number): number {
  if (!Number.isFinite(jobPriceCents) || jobPriceCents <= 0) return VANO_FEE_MIN_CENTS;
  return Math.max(VANO_FEE_MIN_CENTS, Math.round((jobPriceCents * VANO_FEE_BPS) / 10000));
}
