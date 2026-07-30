// The SERVER-authoritative household price table — the single place a
// booking price can come from on the backend.
//
// Lifted verbatim out of create-household-payment-checkout so the WhatsApp
// door (whatsapp-inbound) can quote the same prices it charges without a
// second copy drifting. Both functions import THIS file; the frontend keeps
// its own canonical table in src/lib/householdPricing.ts and the two are
// held in lock-step by src/lib/__tests__ — which now imports this module
// directly (it is deliberately pure TypeScript with no Deno APIs, so vitest
// can load it and the old hardcoded "contract" test became a real
// cross-check).
//
// INVARIANT (see CLAUDE.md "Pricing"): every TIME-BASED rate must net a
// student ≥ Ireland's €14.15/hr minimum wage. Under direct-pay the student
// keeps 100%, so the labour rate IS their wage. RAISED €18 → €22/hr (owner
// call 2026-07-30) — €18 was only ~€4.50/hr better than a supermarket shift
// with guaranteed hours and no travel, which is too thin to hold supply.
// €22 still sits ~21% under the display-only market anchors the builder
// quotes (€28 cleaning / €30 garden), so the value promise to households
// survives. Every hour map below is €22 × hours; keep them that way.

export const VALID_CATEGORIES = [
  // CategoryGrid originals
  'shopping', 'dog-walk', 'garden', 'moving', 'cleaning', 'tutoring',
  // Business temp staff (owner test 2026-07-23) — flyer runs, sampling,
  // events, shop cover at a premium €28/hr; dispatches like 'custom'
  'business',
  // TaskShowcase own slugs (each bookable independently)
  'grocery-shopping', 'dog-walking', 'lawn-mowing', 'moving-help', 'outdoor-cleaning', 'tutoring-grinds',
  // Misc / errand slugs
  'post-office', 'pharmacy-run', 'furniture-assembly', 'tech-help', 'wait-delivery',
  // Extra home services
  'handyman',
  // RETIRED (July 2026, liability triage — do not re-add):
  //  - 'plumbing'      → trade work; the safety screen promises "not qualified
  //                      tradespeople" and free-text plumbing is blocked there.
  //  - 'midnight-lift' → carrying passengers for reward needs an SPSV licence
  //                      and hire-and-reward motor insurance a student's
  //                      personal policy never includes.
  // Labels for both live on in CATEGORY_LABELS so historical bookings render.
  // Airbnb Host monthly plans
  'airbnb-essential', 'airbnb-popular', 'airbnb-premium',
  // "Name any job" — priced by the hour at the standard €22/hr labour rate
  'custom',
] as const;
export type Category = typeof VALID_CATEGORIES[number];

// Customer-side service fee added on top of the quoted price at checkout
// (the student-side 15% cut lives in capture-household-payment).
export const SERVICE_FEE_PCT = 0.075;

export function computePriceCents(category: Category, sizeLabel: string, extraLabel: string): number | null {
  // Flat-rate errand services
  const flat: Partial<Record<Category, number>> = {
    'post-office':   1000,
    'pharmacy-run':  1200, // €12 — covers student travel + time
  };
  if (category in flat) return flat[category]!;

  // Laundry — priced per BAG (owner ladder 2026-07-24: €30/€50/€65 for
  // 1/2/3 bags). No/unknown size falls back to the 1-bag €30 so WhatsApp
  // drafts (needsSize('shopping') is false), stale clients and memory
  // rebooks keep pricing. MUST mirror LAUNDRY_BAG_CENTS in
  // src/lib/householdPricing.ts.
  if (category === 'shopping') {
    const bags: Record<string, number> = { '1 bag': 3000, '2 bags': 5000, '3 bags': 6500 };
    return bags[sizeLabel] ?? 3000;
  }

  // Grocery shopping — list size
  if (category === 'grocery-shopping') {
    const map: Record<string, number> = {
      'Quick errand':      1200,
      'Weekly shop':       1800,
      'Big monthly shop':  2800,
    };
    return map[sizeLabel] ?? null;
  }

  // Dog walking — pre-combined duration + dog count option
  if (category === 'dog-walk' || category === 'dog-walking') {
    const combined: Record<string, number> = {
      '30 min · 1 dog':  1200,
      '1 hr · 1 dog':    1600,
      '1 hr · 2 dogs':   2000,
      '2 hrs · 1 dog':   2200,
      '2 hrs · 2+ dogs': 2800,
      // CategoryGrid quick-book — must match the prices shown in the sheet.
      // 30 min holds the site-wide "from €15" anchor (already €30/hr
      // effective — a short visit pays for the trip); the 1-hour walk rose
      // €20 → €24 on 2026-07-30 so an hour of walking isn't the worst-paid
      // hour on the platform now labour is €22/hr.
      '30 min': 1500, '1 hour': 2400,
    };
    const base = combined[sizeLabel] ?? null;
    if (base == null) return null;
    // Dog-type surcharge (owner call 2026-07-27: a bigger/stronger dog or a
    // second lead is genuinely more work — the walk price must say so). The
    // sheet's one-tap "What kind of dog?" answer rides in extra_label and is
    // priced HERE, exactly like tutoring's level — the client only ever
    // displays these numbers. Keys MUST match the carries in
    // src/lib/jobBuilder.ts SIZING_QUESTIONS['dog-walk'] and the display map
    // DOG_UPCHARGE_CENTS in src/lib/householdPricing.ts — jobBuilder.test.ts
    // holds all three in lock-step. No/unknown extra (the WhatsApp door,
    // memory rebooks, old links) prices at base — fail-soft, never a 400.
    const dogUpcharge: Record<string, number> = {
      'Small dog': 0, 'Medium dog': 0, 'Big dog': 300, 'Two dogs': 500,
    };
    return base + (dogUpcharge[extraLabel] ?? 0);
  }

  // Garden / lawn mowing — hour labels must match the CategoryGrid sheet (€22/hr × 1–8h)
  if (category === 'garden' || category === 'lawn-mowing') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid) — €22/hr since 2026-07-30
      '1 hour': 2200,  '2 hours': 4400,  '3 hours': 6600,  '4 hours': 8800,
      '5 hours': 11000, '6 hours': 13200, '7 hours': 15400, '8 hours': 17600,
      // QUARTER-hour billing steps (tick-box builder — 2026-07-27 halves,
      // narrowed to quarters 2026-07-30 so every tick moves the price under
      // every sizing factor; mirror src/lib hoursFromLabel's decimal parsing,
      // which prices these on the frontend without a table entry)
      '1.25 hours': 2750, '1.5 hours': 3300, '1.75 hours': 3850,
      '2.25 hours': 4950, '2.5 hours': 5500, '2.75 hours': 6050,
      '3.25 hours': 7150, '3.5 hours': 7700, '3.75 hours': 8250,
      '4.25 hours': 9350, '4.5 hours': 9900, '4.75 hours': 10450,
      '5.25 hours': 11550, '5.5 hours': 12100, '5.75 hours': 12650,
      '6.25 hours': 13750, '6.5 hours': 14300, '6.75 hours': 14850,
      '7.25 hours': 15950, '7.5 hours': 16500, '7.75 hours': 17050,
      'Half day': 8800,
      // size-based (TaskShowcase)
      'Small (terrace / apartment)': 2200,
      'Medium (semi-detached)':      3800,
      'Large (detached)':            6000,
      'Extra large':                 9000,
    };
    return map[sizeLabel] ?? null;
  }

  // Moving — hour labels must match the CategoryGrid sheet (€22/hr, '4+ hours' priced as 4h)
  if (category === 'moving' || category === 'moving-help') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid) — €22/hr since 2026-07-30
      '1 hour': 2200,  '2 hours': 4400,  '3 hours': 6600,  '4 hours': 8800, '4+ hours': 8800,
      '5 hours': 11000, '6 hours': 13200, '7 hours': 15400, '8 hours': 17600,
      // quarter-hour billing steps (builder machinery — category parked but
      // the tables stay lock-step)
      '1.25 hours': 2750, '1.5 hours': 3300, '1.75 hours': 3850,
      '2.25 hours': 4950, '2.5 hours': 5500, '2.75 hours': 6050,
      '3.25 hours': 7150, '3.5 hours': 7700, '3.75 hours': 8250,
      // job-size (TaskShowcase)
      'A few boxes / items': 2500,
      'One room':            4000,
      '2–3 rooms':           7000,
      'Full home':           10000,
    };
    return map[sizeLabel] ?? null;
  }

  // Cleaning — hour labels must match the CategoryGrid sheet (€22/hr × 1–8h)
  if (category === 'cleaning' || category === 'outdoor-cleaning') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid) — €22/hr since 2026-07-30
      '1 hour': 2200,  '2 hours': 4400, '3 hours': 6600,  '4 hours': 8800,
      '5 hours': 11000, '6 hours': 13200, '7 hours': 15400, '8 hours': 17600,
      // QUARTER-hour billing steps (tick-box builder — 2026-07-27 halves,
      // narrowed to quarters 2026-07-30 so every tick moves the price under
      // every sizing factor). The sheet's cleaning chips cap at 6h since
      // 2026-07-27 (was 3h — a 4+ bed home with every task ticked, incl.
      // the extra-messy condition tick, estimates 5.4h; billing that at a
      // low cap paid the student under the hourly promise), so the steps
      // run to 5.75.
      '1.25 hours': 2750, '1.5 hours': 3300, '1.75 hours': 3850,
      '2.25 hours': 4950, '2.5 hours': 5500, '2.75 hours': 6050,
      '3.25 hours': 7150, '3.5 hours': 7700, '3.75 hours': 8250,
      '4.25 hours': 9350, '4.5 hours': 9900, '4.75 hours': 10450,
      '5.25 hours': 11550, '5.5 hours': 12100, '5.75 hours': 12650,
      // area-based (TaskShowcase)
      'Small area':  2200,
      'Medium area': 3800,
      'Large area':  5500,
    };
    return map[sizeLabel] ?? null;
  }

  // Furniture assembly — item count
  if (category === 'furniture-assembly') {
    const map: Record<string, number> = {
      // legacy time-based
      '1 hour': 2000, '2 hours': 4000, '3 hours': 6000,
      // new item count
      '1 item':    2200,
      '2–3 items': 3800,
      '4–6 items': 5800,
      '7+ items':  8000,
    };
    return map[sizeLabel] ?? null;
  }

  // Tech help — device type
  if (category === 'tech-help') {
    const map: Record<string, number> = {
      // legacy time-based
      '1 hour': 2500, '2 hours': 5000,
      // new device-based
      'Phone / tablet':    2000,
      'Laptop / PC':       2800,
      'TV / streaming':    2200,
      'Wi-Fi / router':    3000,
      'Smart home setup':  4000,
    };
    return map[sizeLabel] ?? null;
  }

  // Handyman — hourly
  if (category === 'handyman') {
    return ({ '1 hour': 2500, '2 hours': 4500, '3 hours': 6500 })[sizeLabel] ?? null;
  }

  // Business temp staff — €28/hr premium, 2-hour MINIMUM shift (no 1-hour
  // option by design: a shorter call-out isn't worth a student's trip and the
  // bigger ticket is the point — Vano's 15% fee rides on it). MUST mirror
  // HOURLY_RATE_CENTS.business in src/lib/householdPricing.ts.
  if (category === 'business') {
    const map: Record<string, number> = {
      '2 hours': 5600,  '3 hours': 8400,  '4 hours': 11200,
      '5 hours': 14000, '6 hours': 16800, '7 hours': 19600, '8 hours': 22400,
    };
    return map[sizeLabel] ?? null;
  }

  // Wait for delivery — duration tier
  if (category === 'wait-delivery') {
    const extra: Record<string, number> = { 'Up to 2 hours': 1000, 'Up to 4 hours': 1800 };
    if (extra[sizeLabel]) return extra[sizeLabel];
    return 1000; // legacy flat
  }

  // Airbnb Host monthly plans — flat rate per tier
  if (category === 'airbnb-essential') return 12900;
  if (category === 'airbnb-popular')   return 19900;
  if (category === 'airbnb-premium')   return 29900;

  // Custom "name any job" — priced purely by booked time at the €22/hr labour
  // rate (the same hour labels the CategoryGrid sheet uses). Short visits
  // (30/45 min) are offered for quick jobs and floored to the €12 booking
  // minimum. Time-based by design: whatever the job, the floor keeps it above
  // minimum wage. MUST mirror getHouseholdPriceCents in src/lib/householdPricing.ts.
  if (category === 'custom') {
    const hourMap: Record<string, number> = {
      '30 min': 1400, '45 min': 1650, // €22/hr × 0.5/0.75, floored at €14
      '1 hour': 2200,  '2 hours': 4400,  '3 hours': 6600,  '4 hours': 8800,
      '5 hours': 11000, '6 hours': 13200, '7 hours': 15400, '8 hours': 17600,
      // Alias: old clients (and any cached bundle) sent "1 hours" for every
      // typicalHours-1 catalogue job — an exact-lookup miss here 400'd the
      // whole booking. Keep the alias so stale clients still price.
      '1 hours': 2200,
    };
    return hourMap[sizeLabel] ?? null;
  }

  // Tutoring — level (sizeLabel) × duration (extraLabel)
  if (category === 'tutoring' || category === 'tutoring-grinds') {
    const rate: Record<string, number> = {
      'Primary school': 2200,
      'Junior Cert':    2800,
      'Leaving Cert':   3200,
      'College / Uni':  3800,
    };
    const hrs: Record<string, number> = { '1 hour': 1, '2 hours': 2, '3 hours': 3 };
    // CategoryGrid quick-book sends plain hour labels — €22/hr × 1–8h, must match the sheet
    if (!rate[sizeLabel]) {
      const hourMap: Record<string, number> = {
        '1 hour': 2200,  '2 hours': 4400, '3 hours': 6600,  '4 hours': 8800,
        '5 hours': 11000, '6 hours': 13200, '7 hours': 15400, '8 hours': 17600,
      };
      return hourMap[sizeLabel] ?? null;
    }
    const h = hrs[extraLabel];
    if (h === undefined) return null;
    return rate[sizeLabel] * h;
  }

  return null;
}

// ── Bring-the-basics supplies add-on (2026-07-30) ─────────────────────────
// The equipment question's cleaning "no products" answer books the helper to
// BRING sprays/cloths for a flat add-on. Charged only when the checkout body
// carries an explicit `bring_supplies: true` for a cleaning booking — the
// note text NEVER drives a price. The add-on is part of the JOB price (it's
// the student's money — they buy the supplies), not Vano's fee; the fee is
// computed on the BASE job price so the helper's expenses aren't taxed.
// MUST mirror SUPPLIES_ADDON_CENTS in src/lib/householdPricing.ts —
// jobBuilder.test.ts keeps the two in lock-step.
export const SUPPLIES_ADDON_CENTS = 800;

// ── Travel top-up (2026-07-30) ────────────────────────────────────────────
// A €30 job with a 25-minute cycle each way is really ~€11/hr for the
// student — the top-up keeps far-out jobs honestly worth taking. Flat ladder
// keyed on straight-line distance from Eyre Square (helpers overwhelmingly
// live in the city): inside ~8 km (all of the city, Salthill, Knocknacarra,
// Barna edge) → nothing; 8–15 km (Oranmore, Claregalway) → €4; beyond
// (Athenry, Gort…) → €8. 100% of it is the HELPER'S money (it rides the job
// price, which Vano never touches under direct-pay); Vano's fee stays on the
// base price. Fail-soft: no coordinates → no top-up, exactly the old price —
// a booking can never 400 over geography. Thresholds are owner-tunable; keep
// the two modules mirrored (jobBuilder.test.ts locks them in step).
export const GALWAY_CENTRE = { lat: 53.2745, lng: -9.0491 }; // Eyre Square
export const TRAVEL_TOPUP_NEAR_KM = 8;
export const TRAVEL_TOPUP_FAR_KM = 15;
export const TRAVEL_TOPUP_NEAR_CENTS = 400;
export const TRAVEL_TOPUP_FAR_CENTS = 800;

/** Straight-line km between two points (haversine). */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Travel top-up for a job at the given coordinates, in cents (0 = none).
 *  Anything non-finite → 0 (fail-soft — geography never blocks a booking). */
export function travelTopupCents(lat: number | null | undefined, lng: number | null | undefined): number {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return 0;
  const km = distanceKm(lat, lng, GALWAY_CENTRE.lat, GALWAY_CENTRE.lng);
  // Sanity ceiling: a badly-geocoded address (wrong county, wrong country)
  // must not silently add a top-up to a booking that's probably in town.
  if (km > 60) return 0;
  if (km > TRAVEL_TOPUP_FAR_KM) return TRAVEL_TOPUP_FAR_CENTS;
  if (km > TRAVEL_TOPUP_NEAR_KM) return TRAVEL_TOPUP_NEAR_CENTS;
  return 0;
}

// Record<string, string> (not Record<Category, string>): retired slugs keep
// their labels here so historical bookings still render everywhere.
export const CATEGORY_LABELS: Record<string, string> = {
  business:             'Business temp staff',
  shopping:             'Laundry',
  'grocery-shopping':   'Grocery shopping',
  'dog-walk':           'Dog walk',
  'dog-walking':        'Dog walking',
  garden:               'Garden help',
  'lawn-mowing':        'Lawn mowing',
  moving:               'Moving help',
  'moving-help':        'Moving help',
  cleaning:             'Cleaning',
  'outdoor-cleaning':   'Outdoor cleaning',
  tutoring:             'Tutoring',
  'tutoring-grinds':    'Tutoring & grinds',
  'post-office':        'Post office run',
  'pharmacy-run':       'Pharmacy run',
  'furniture-assembly': 'Furniture assembly',
  'tech-help':          'Tech help',
  'wait-delivery':      'Wait for delivery',
  handyman:             'Handyman',
  // Retired categories — display-only, no longer bookable (see VALID_CATEGORIES)
  'midnight-lift':      'Midnight Lift',
  plumbing:             'Plumbing help',
  'airbnb-essential':   'Airbnb Host Essential',
  'airbnb-popular':     'Airbnb Host Popular',
  'airbnb-premium':     'Airbnb Host Full Management',
  custom:               'Custom job',
};

// Deploy retry marker 2026-07-27: the post-#379 deploy run died on a
// transient esm.sh 522 while bundling (CDN outage, not a code failure) —
// this touch re-fires the supabase-deploy workflow so the half-hour price
// entries above actually reach production. Safe to remove on any future edit.
