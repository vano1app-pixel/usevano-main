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
// student ≥ Ireland's €14.15/hr minimum wage after the 15% platform cut —
// that's why the labour rates all sit at €18/hr (net €15.30/hr).

export const VALID_CATEGORIES = [
  // CategoryGrid originals
  'shopping', 'dog-walk', 'garden', 'moving', 'cleaning', 'tutoring',
  // Business temp staff (owner test 2026-07-23) — flyer runs, sampling,
  // events, shop cover at a premium €22/hr; dispatches like 'custom'
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
  // "Name any job" — priced by the hour at the standard €18/hr labour rate
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
      // CategoryGrid quick-book — must match the prices shown in the sheet
      '30 min': 1500, '1 hour': 2000,
    };
    return combined[sizeLabel] ?? null;
  }

  // Garden / lawn mowing — hour labels must match the CategoryGrid sheet (€18/hr × 1–8h)
  if (category === 'garden' || category === 'lawn-mowing') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid)
      '1 hour': 1800,  '2 hours': 3600,  '3 hours': 5400,  '4 hours': 7200,
      '5 hours': 9000, '6 hours': 10800, '7 hours': 12600, '8 hours': 14400,
      'Half day': 7200,
      // size-based (TaskShowcase)
      'Small (terrace / apartment)': 2200,
      'Medium (semi-detached)':      3800,
      'Large (detached)':            6000,
      'Extra large':                 9000,
    };
    return map[sizeLabel] ?? null;
  }

  // Moving — hour labels must match the CategoryGrid sheet (€18/hr, '4+ hours' priced as 4h)
  if (category === 'moving' || category === 'moving-help') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid)
      '1 hour': 1800,  '2 hours': 3600,  '3 hours': 5400,  '4 hours': 7200, '4+ hours': 7200,
      '5 hours': 9000, '6 hours': 10800, '7 hours': 12600, '8 hours': 14400,
      // job-size (TaskShowcase)
      'A few boxes / items': 2500,
      'One room':            4000,
      '2–3 rooms':           7000,
      'Full home':           10000,
    };
    return map[sizeLabel] ?? null;
  }

  // Cleaning — hour labels must match the CategoryGrid sheet (€18/hr × 1–8h)
  if (category === 'cleaning' || category === 'outdoor-cleaning') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid)
      '1 hour': 1800,  '2 hours': 3600, '3 hours': 5400,  '4 hours': 7200,
      '5 hours': 9000, '6 hours': 10800, '7 hours': 12600, '8 hours': 14400,
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

  // Business temp staff — €22/hr premium, 2-hour MINIMUM shift (no 1-hour
  // option by design: a shorter call-out isn't worth a student's trip and the
  // bigger ticket is the point — Vano's 15% fee rides on it). MUST mirror
  // HOURLY_RATE_CENTS.business in src/lib/householdPricing.ts.
  if (category === 'business') {
    const map: Record<string, number> = {
      '2 hours': 4400,  '3 hours': 6600,  '4 hours': 8800,
      '5 hours': 11000, '6 hours': 13200, '7 hours': 15400, '8 hours': 17600,
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

  // Custom "name any job" — priced purely by booked time at the €18/hr labour
  // rate (the same hour labels the CategoryGrid sheet uses). Short visits
  // (30/45 min) are offered for quick jobs and floored to the €12 booking
  // minimum. Time-based by design: whatever the job, the floor keeps it above
  // minimum wage. MUST mirror getHouseholdPriceCents in src/lib/householdPricing.ts.
  if (category === 'custom') {
    const hourMap: Record<string, number> = {
      '30 min': 1200, '45 min': 1350, // €18/hr × 0.5/0.75, floored at €12
      '1 hour': 1800,  '2 hours': 3600,  '3 hours': 5400,  '4 hours': 7200,
      '5 hours': 9000, '6 hours': 10800, '7 hours': 12600, '8 hours': 14400,
      // Alias: old clients (and any cached bundle) sent "1 hours" for every
      // typicalHours-1 catalogue job — an exact-lookup miss here 400'd the
      // whole booking. Keep the alias so stale clients still price.
      '1 hours': 1800,
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
    // CategoryGrid quick-book sends plain hour labels — €18/hr × 1–8h, must match the sheet
    if (!rate[sizeLabel]) {
      const hourMap: Record<string, number> = {
        '1 hour': 1800,  '2 hours': 3600, '3 hours': 5400,  '4 hours': 7200,
        '5 hours': 9000, '6 hours': 10800, '7 hours': 12600, '8 hours': 14400,
      };
      return hourMap[sizeLabel] ?? null;
    }
    const h = hrs[extraLabel];
    if (h === undefined) return null;
    return rate[sizeLabel] * h;
  }

  return null;
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
