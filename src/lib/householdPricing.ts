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
 * All sit at €18/hr so a student nets ≥ €14.15/hr after the 15% cut.
 *
 * `custom` is the catch-all "name any job" rate: because it's priced by the
 * hour at the same €18/hr floor, a custom job can never undercut minimum wage,
 * whatever the task. The market-comparison figures shown next to it in the
 * CustomJobBuilder are display-only and never charged.
 */
export const HOURLY_RATE_CENTS: Record<string, number> = {
  garden:   1800,
  moving:   1800,
  cleaning: 1800,
  tutoring: 1800,
  painting: 1800,
  custom:   1800,
};

/** Flat, JOB-BASED prices (one price for the task done), in cents. */
export const FLAT_PRICE_CENTS: Record<string, number> = {
  shopping: 1500, // Laundry — collected, washed, returned folded
};

/** Leading hour count from a size label ("2 hours", "4+ hours") → 1–8 or null. */
function hoursFromLabel(size: string): number | null {
  const n = Number(size.match(/^\d+/)?.[0]);
  return Number.isFinite(n) && n >= 1 && n <= 8 ? n : null;
}

/**
 * Price for a one-off booking in cents, or null if the combination isn't
 * priceable. Mirrors computePriceCents for the categories the quick-book
 * sheet offers (dog walk is a flat 30-min / 1-hour walk, not an hourly rate).
 */
export function getHouseholdPriceCents(slug: string, size: string): number | null {
  if (slug in FLAT_PRICE_CENTS) return FLAT_PRICE_CENTS[slug];
  if (slug === 'dog-walk') return size === '30 min' ? 1500 : 2000;
  const rate = HOURLY_RATE_CENTS[slug];
  if (rate) {
    const hours = hoursFromLabel(size);
    if (hours) return rate * hours;
  }
  return null;
}

/** "from €X/hr" summary for the marketing PricingTable; null if not hourly. */
export function hourlyRateLabel(slug: string): string | null {
  const rate = HOURLY_RATE_CENTS[slug];
  return rate ? `from €${rate / 100}/hr` : null;
}
