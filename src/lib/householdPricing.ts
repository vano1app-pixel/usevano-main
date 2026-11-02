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
 *
 * RAISED €18 → €22/hr (owner call 2026-07-30). Two reasons, both about
 * making the site worth using for BOTH sides:
 *   • HELPERS: under direct-pay the student keeps 100%, so this is literally
 *     their wage. €18 was only €4.50/hr above a Tesco shift with guaranteed
 *     hours and no travel — too thin to hold supply. €22 makes VANO the
 *     obviously better choice.
 *   • HOUSEHOLDS: still ~21% under the display-only market anchors this repo
 *     already quotes (€28/hr cleaning, €30/hr garden — see
 *     BUILDER_MARKET_RATE_CENTS in jobBuilder.ts), so the "students are
 *     better value than an agency" promise stays true and the builder's
 *     "you save ~€X" line can never read negative.
 * Trivially clear of the €14.15/hr minimum-wage floor the tests enforce.
 *
 * `custom` is the catch-all "name any job" rate: because it's priced by the
 * hour at the same €22/hr floor, a custom job can never undercut minimum wage,
 * whatever the task. The market-comparison figures shown next to it in the
 * CustomJobBuilder are display-only and never charged.
 *
 * `business` (owner test, 2026-07-23) is the temp-staff tier — flyer runs,
 * sampling, events, shop cover — priced at a PREMIUM €28/hr: businesses pay
 * agency-style money, the student keeps 100% of the bigger rate, and Vano's
 * 15% fee rides on the bigger ticket. 2-hour minimum shift (see CategoryGrid
 * sizes — there's no '1 hour' option).
 */
export const HOURLY_RATE_CENTS: Record<string, number> = {
  garden:   2200,
  moving:   2200,
  cleaning: 2200,
  tutoring: 2200,
  custom:   2200,
  // Business was the €22 "premium" tier when households sat at €18. Households
  // are now €22 too, so the premium moves up to keep the tier meaningful.
  // Parked category — no live customer sees this.
  business: 2800,
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
 * Booking minimum (cents) for short custom visits. €22/hr × 0.5 = €11 is
 * too small to be worth a student's trip out, so a half-hour job is floored
 * to €14. Direct-pay: the student keeps 100% (€14 for 30 min = €28/hr), which
 * is the point — a short visit has to pay for the journey, not just the task.
 * Mirrors the server's custom hour map.
 */
export const MIN_BOOKING_CENTS = 1400;

/**
 * Dog-type surcharge for quick-book walks (owner call 2026-07-27: a bigger/
 * stronger dog or a second lead is more work — the walk price must say so).
 * Keyed on the extra_label the sheet's "What kind of dog?" answer sends; the
 * SERVER re-prices it authoritatively (the same map lives in the dog-walk
 * branch of supabase/functions/_shared/householdPricing.ts — jobBuilder.test
 * keeps the two in lock-step). Small + Medium sit at 0 on purpose: the
 * ladder reads as "big dogs cost a bit more", never "small dogs got cheaper".
 */
export const DOG_UPCHARGE_CENTS: Record<string, number> = {
  'Small dog':  0,
  'Medium dog': 0,
  'Big dog':    300,
  'Two dogs':   500,
};

/**
 * Bring-the-basics supplies add-on (2026-07-30): the equipment question's
 * cleaning "no products" answer books the helper to bring sprays/cloths for
 * this flat add-on. Display mirror of SUPPLIES_ADDON_CENTS in
 * supabase/functions/_shared/householdPricing.ts — the SERVER charges it
 * (from an explicit bring_supplies boolean, never the note text) and it's
 * the STUDENT'S money (they buy the supplies); Vano's fee stays on the base
 * job price. jobBuilder.test.ts keeps the two in lock-step.
 */
export const SUPPLIES_ADDON_CENTS = 800;

/**
 * Travel top-up (2026-07-30) — display mirror of the server ladder in
 * supabase/functions/_shared/householdPricing.ts (which charges it
 * authoritatively from the geocoded booking coordinates). Flat ladder on
 * straight-line km from Eyre Square: ≤8 km → €0, 8–15 km → €4, beyond → €8.
 * 100% goes to the helper (it rides the job price). Fail-soft: no coords →
 * 0. jobBuilder.test.ts locks the two modules in step.
 */
export const GALWAY_CENTRE = { lat: 53.2745, lng: -9.0491 }; // Eyre Square
export const TRAVEL_TOPUP_NEAR_KM = 8;
export const TRAVEL_TOPUP_FAR_KM = 15;
export const TRAVEL_TOPUP_NEAR_CENTS = 400;
export const TRAVEL_TOPUP_FAR_CENTS = 800;

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function travelTopupCents(lat: number | null | undefined, lng: number | null | undefined): number {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return 0;
  const km = distanceKm(lat, lng, GALWAY_CENTRE.lat, GALWAY_CENTRE.lng);
  if (km > 60) return 0; // bad geocode sanity ceiling — mirrors the server
  if (km > TRAVEL_TOPUP_FAR_KM) return TRAVEL_TOPUP_FAR_CENTS;
  if (km > TRAVEL_TOPUP_NEAR_KM) return TRAVEL_TOPUP_NEAR_CENTS;
  return 0;
}

export function getHouseholdPriceCents(slug: string, size: string, extraLabel?: string): number | null {
  if (slug === 'shopping') return LAUNDRY_BAG_CENTS[size] ?? FLAT_PRICE_CENTS.shopping;
  if (slug in FLAT_PRICE_CENTS) return FLAT_PRICE_CENTS[slug];
  if (slug === 'dog-walk') {
    // 30 min stays €15 — the site-wide "from €15" anchor, and already €30/hr
    // effective because a short visit has to pay for the trip. The 1-hour
    // walk rises €20 → €24: at €20 it would have been BELOW the new €22/hr
    // labour rate, which would have made an hour of walking the worst-paid
    // hour on the platform.
    const base = size === '30 min' ? 1500 : 2400;
    return base + (extraLabel ? DOG_UPCHARGE_CENTS[extraLabel] ?? 0 : 0);
  }
  // Custom "name any job" supports short half-/three-quarter-hour visits for
  // quick jobs (dog walk, bins, key-drop…), floored at the booking minimum.
  if (slug === 'custom') {
    if (size === '30 min') return MIN_BOOKING_CENTS;                 // €22/hr × 0.5 = €11 → floored to €14
    if (size === '45 min') return Math.max(1650, MIN_BOOKING_CENTS); // €22/hr × 0.75 = €16.50
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

/**
 * The entry price for a category in that category's OWN unit — the label the
 * front-door tiles carry.
 *
 * The grid mixes three units: cleaning and garden are hourly, laundry is per
 * BAG and a dog walk is per WALK. A single shared "/hr" would be false on
 * half the tiles, so each one states its own. Every number is derived from
 * the tables above (never typed twice), so a price change lands on the front
 * door automatically and can't drift out of lock-step with checkout.
 *
 * Returns null for any category without an honest single entry price — the
 * tile then renders name-only, exactly as it did before.
 */
export function tileEntryPriceLabel(slug: string): string | null {
  const hourly = HOURLY_RATE_CENTS[slug];
  if (hourly) return `from €${hourly / 100}/hr`;
  if (slug === 'shopping') {
    const cents = getHouseholdPriceCents('shopping', '1 bag');
    return cents ? `from €${cents / 100}/bag` : null;
  }
  if (slug === 'dog-walk') {
    const cents = getHouseholdPriceCents('dog-walk', '30 min');
    return cents ? `from €${cents / 100}/walk` : null;
  }
  return null;
}

// ── Direct-pay model (July 2026) ──────────────────────────────────────────
// Vano never holds the job money: the customer pays the STUDENT directly
// (Revolut / cash) and the student keeps 100% of the job price. Vano's card
// charge is ONLY the booking fee below (+ the optional €2 Vano Cover), taken
// when a helper accepts. Mirrors supabase/functions/_shared/vanoFees.ts —
// householdPayMath.test.ts keeps the two in lock-step.

/** Customer-side booking fee: 15% of the job price, floored at €5.
 *  Raised €4 → €5 (owner call 2026-07-30): Stripe takes ~€0.79 of a €4 fee,
 *  so small jobs netted VANO barely €3.20 — under the cost of supporting
 *  them. Mirrors _shared/vanoFees.ts; householdPayMath.test keeps them in
 *  lock-step. */
export const VANO_FEE_BPS = 1500;
export const VANO_FEE_MIN_CENTS = 500;
/** Optional Vano Cover add-on (accidental damage up to €250) — flat €2. */
export const VANO_COVER_CENTS = 200;

export function computeVanoFeeCents(jobPriceCents: number): number {
  if (!Number.isFinite(jobPriceCents) || jobPriceCents <= 0) return VANO_FEE_MIN_CENTS;
  return Math.max(VANO_FEE_MIN_CENTS, Math.round((jobPriceCents * VANO_FEE_BPS) / 10000));
}

// ── Card-pay option (2026-07-30, owner test) ─────────────────────────────
// A second way to PAY, not a second flow: the customer can choose to put the
// whole job on their card at accept (job price + fee, one tap, held by
// Stripe) instead of paying the helper directly — the helper STILL keeps
// 100% of the job price (VANO transfers it in full on completion via Stripe
// Connect; only the same 15%/min-€4 fee is VANO's). Everything downstream
// branches on booking_data.card_pay; direct pay stays the default. Flip this
// to false to pull the option from the sheet without touching the server —
// in-flight card-pay bookings still complete correctly (data-driven).
export const CARD_PAY_OFFERED = false; // 2026-09-06: one path — fee hold + helper paid direct (decision A1)
