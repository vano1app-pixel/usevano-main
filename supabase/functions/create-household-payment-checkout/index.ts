import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Inlined CORS ──────────────────────────────────────────────────────
const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return FALLBACK_ORIGINS;
  return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
}
function allowsVercelPreview(origin: string): boolean {
  try { return new URL(origin).hostname.endsWith('-vano1app-pixels-projects.vercel.app'); } catch { return false; }
}
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  if (getAllowlist().includes(n)) return n;
  if (allowsVercelPreview(n)) return n;
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
function isOriginAllowed(req: Request): boolean {
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}
// ───────────────────────────────────────────────────────────────────────────────

// Public (no-auth) entry point for the CategoryGrid quick-booking flow.
// Validates inputs, prices the booking server-side (prevents client tampering),
// inserts an anonymous household_bookings row as status='pending' and
// dispatches it to helpers IMMEDIATELY — no upfront payment.
//
// Pay-after-accept: the customer is only asked to pay once a helper accepts
// (notify-household-accepted creates the Stripe Checkout session and emails
// the pay link). Paying for a named, confirmed person converts far better
// than paying a form — every booking under the old pay-first flow abandoned
// at checkout.
//
// Referral programme (give €5, get €5): an optional referral_code is
// validated here and the discount is RESERVED on the booking
// (booking_data.referral_* + a pending household_referrals row).
// notify-household-accepted applies it to the Stripe session as a coupon,
// and stripe-webhook flips the referral state when the payment lands.

// Same normalization as get-referral-code / stripe-webhook — referral rows
// are keyed on E.164 so "087 123 4567" and "+353871234567" are one customer.
function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

const VALID_CATEGORIES = [
  // CategoryGrid originals
  'shopping', 'dog-walk', 'garden', 'moving', 'cleaning', 'tutoring',
  // TaskShowcase own slugs (each bookable independently)
  'grocery-shopping', 'dog-walking', 'lawn-mowing', 'moving-help', 'outdoor-cleaning', 'tutoring-grinds',
  // Misc / errand slugs
  'post-office', 'pharmacy-run', 'furniture-assembly', 'tech-help', 'wait-delivery',
  // Extra home services
  'handyman', 'plumbing',
  // Midnight lift
  'midnight-lift',
  // Airbnb Host monthly plans
  'airbnb-essential', 'airbnb-popular', 'airbnb-premium',
  // "Name any job" — priced by the hour at the standard €18/hr labour rate
  'custom',
] as const;
type Category = typeof VALID_CATEGORIES[number];

function computePriceCents(category: Category, sizeLabel: string, extraLabel: string): number | null {
  // Flat-rate errand services
  const flat: Partial<Record<Category, number>> = {
    'shopping':      1500,
    'post-office':   1000,
    'pharmacy-run':  1200, // €12 — covers student travel + time
  };
  if (category in flat) return flat[category]!;

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

  // Plumbing help — hourly
  if (category === 'plumbing') {
    return ({ '1 hour': 3000, '2 hours': 5500 })[sizeLabel] ?? null;
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

  // Midnight lift — distance tier
  if (category === 'midnight-lift') {
    const map: Record<string, number> = {
      'Nearby (under 3 km)': 1000,
      'Mid-range (3–10 km)': 1500,
      'Far (10 km+)':        2800,
    };
    return map[sizeLabel] ?? null;
  }

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

const CATEGORY_LABELS: Record<Category, string> = {
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
  'midnight-lift':      'Midnight Lift',
  handyman:             'Handyman',
  plumbing:             'Plumbing help',
  'airbnb-essential':   'Airbnb Host Essential',
  'airbnb-popular':     'Airbnb Host Popular',
  'airbnb-premium':     'Airbnb Host Full Management',
  custom:               'Custom job',
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const { category, when_label, size_label, extra_label, scheduled, note, customer_name, customer_phone, customer_email, customer_address, customer_lat, customer_lng, city, referral_code, scheduled_at: scheduledAtRaw } = body;

    // Book-ahead: the client computes the target time from the chosen slot (it
    // knows the local timezone). Validate it here — must be a real future time
    // within a sane window; anything else falls back to ASAP (null). NULL means
    // "as soon as possible", exactly as today.
    let scheduledAt: string | null = null;
    if (typeof scheduledAtRaw === 'string' && scheduledAtRaw) {
      const t = Date.parse(scheduledAtRaw);
      const now = Date.now();
      // Accept 20 min – 21 days ahead; ignore past/near-now (treat as ASAP) and
      // absurd far-future values.
      if (Number.isFinite(t) && t > now + 20 * 60 * 1000 && t < now + 21 * 24 * 60 * 60 * 1000) {
        scheduledAt = new Date(t).toISOString();
      }
    }

    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      return bad(400, 'Invalid category');
    }
    if (!customer_name?.trim()) return bad(400, 'customer_name is required');
    if (!customer_phone?.trim()) return bad(400, 'customer_phone is required');

    const cat = category as Category;
    const sl  = typeof size_label  === 'string' ? size_label  : '';
    const el  = typeof extra_label === 'string' ? extra_label : '';
    const isScheduled = scheduled === true;

    // ── Safety screen for free-text requests ─────────────────────────────
    // Helpers are ID-verified students, NOT Garda-vetted and not tradespeople.
    // Work with children / vulnerable adults is "relevant work" under the
    // National Vetting Bureau Acts, and trade/height/driving-for-hire work is
    // an insurance and safety line we don't cross. The catalogue no longer
    // offers these, but the "Something else" box takes any text — so screen
    // the request server-side before it can be inserted or dispatched.
    // Deliberately conservative patterns to avoid blocking legitimate jobs
    // (e.g. "clean the kids' bedroom" must still pass).
    const UNSAFE_REQUEST_PATTERNS: Array<{ re: RegExp; reason: string }> = [
      { re: /\b(babysit|baby[- ]?sit|babysitt|childmind|child[- ]?mind|nanny|au pair|creche|crèche)/i,
        reason: 'minding children' },
      { re: /\b(school (run|pickup|pick[- ]?up|drop[- ]?off|collection))|collect\w* (the |my )?(kids|children)\b/i,
        reason: 'minding children' },
      { re: /\b(mind|watch|look after|take care of|care for) (the |my |our )?(kid|kids|child|children|baby|toddler|son|daughter|little one)/i,
        reason: 'minding children' },
      { re: /\b(elderly|dementia|alzheimer|carer|caregiver|home care|personal care|medication|nursing)\b/i,
        reason: 'caring for a vulnerable person' },
      { re: /\b(rewire|fuse ?board|consumer unit|socket|mains|boiler|gas |immersion|electrics|electrical work)\b/i,
        reason: 'qualified trade work' },
      { re: /\b(roof|chimney|scaffold|gutters?\b)/i,
        reason: 'working at height' },
      { re: /\b(lift|drive|run) (me|us|him|her) to\b|\ba lift to\b|\bairport (run|lift|drop)/i,
        reason: 'driving passengers' },
    ];
    const requestText = `${typeof note === 'string' ? note : ''} ${el}`.trim();
    if (requestText) {
      const hit = UNSAFE_REQUEST_PATTERNS.find(p => p.re.test(requestText));
      if (hit) {
        console.warn(`[checkout] blocked unsafe request (${hit.reason}): "${requestText.slice(0, 120)}"`);
        return bad(422,
          `Sorry — this looks like ${hit.reason}, which VANO can't take on. ` +
          `Our helpers are ID-verified students, not Garda-vetted carers or qualified tradespeople. ` +
          `If we've read your request wrong, WhatsApp us on +353 89 981 7111 and a person will sort it.`);
      }
    }

    let priceCents = computePriceCents(cat, sl, el);
    if (!priceCents) {
      return bad(400, `No price available for ${category} / ${sl}${el ? ' / ' + el : ''}`);
    }
    const isMonthlyPlan = cat.startsWith('airbnb-');

    // Schedule and loyalty discounts don't apply to monthly Airbnb plans
    if (!isMonthlyPlan && isScheduled) priceCents = Math.round(priceCents * 0.9);

    // Vano's take has two parts: a 7.5% service fee added on top of the
    // quoted price here, plus a 15% student-side cut taken off the price at
    // completion (PLATFORM_FEE_BPS in capture-household-payment). Combined
    // that's ~22.5% of the quoted price (~21% of what the customer pays) —
    // NOT the 12.5% an older comment claimed. Every time-based labour rate
    // is now €18/hr (cleaning, tutoring, garden, moving), so the 15% cut
    // still nets the student €15.30/hr — clear of the €14.15/hr 2026
    // minimum wage.
    const SERVICE_FEE_PCT  = 0.075;
    const serviceFeeCents  = isMonthlyPlan ? 0 : Math.round(priceCents * SERVICE_FEE_PCT);

    const supabase = createClient(supabaseUrl, serviceKey);
    let isLoyalty = false;
    if (!isMonthlyPlan) {
      // Only PAID bookings count toward loyalty — bookings are now created
      // before payment, so counting all non-cancelled rows would let spam
      // bookings farm the every-3rd-booking discount.
      const { count: loyaltyCount } = await supabase
        .from('household_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('customer_phone', customer_phone.trim())
        .not('paid_at', 'is', null)
        .neq('status', 'cancelled');
      const confirmedCount = loyaltyCount ?? 0;
      isLoyalty = (confirmedCount + 1) % 3 === 0;
      if (isLoyalty) priceCents = Math.round(priceCents * 0.5);
    }

    // ── Referral programme (give €5, get €5) ──────────────────────────────
    // Two mutually exclusive discounts, at most one per booking:
    //   welcome — first-ever booking arriving through a friend's ?ref link
    //   redeem  — referrer spending a credit a friend earned them
    // Validated here, reserved on the booking, applied to the Stripe session
    // by notify-household-accepted. Every step is best-effort: any error
    // zeroes the discount and the booking proceeds at full price. Helper pay
    // is based on price_estimate_cents, which the discount NEVER touches —
    // the €5 rides a Stripe coupon, funded by the platform.
    const normalizedPhone = normalizeE164(customer_phone);
    let referralWelcome: { code: string; referrerPhone: string } | null = null;
    let redeemRow: { id: string; credit_cents: number } | null = null;

    if (!isMonthlyPlan && normalizedPhone) {
      try {
        const rawRef = typeof referral_code === 'string' ? referral_code.trim().toUpperCase() : '';
        if (rawRef && /^[A-Z0-9]{4,12}$/.test(rawRef)) {
          const { data: codeRow } = await supabase
            .from('household_referral_codes')
            .select('code, phone')
            .eq('code', rawRef)
            .maybeSingle();
          if (codeRow && (codeRow.phone as string) !== normalizedPhone) {
            const phoneForms = [...new Set([customer_phone.trim(), normalizedPhone])];
            const { count: paidBookings } = await supabase
              .from('household_bookings')
              .select('id', { count: 'exact', head: true })
              .in('customer_phone', phoneForms)
              .not('paid_at', 'is', null);
            const { data: priorReferral } = await supabase
              .from('household_referrals')
              .select('id')
              .eq('referee_phone', normalizedPhone)
              .maybeSingle();
            if ((paidBookings ?? 0) === 0 && !priorReferral) {
              referralWelcome = { code: codeRow.code as string, referrerPhone: codeRow.phone as string };
            }
          }
        }
        if (!referralWelcome) {
          const { data: earned } = await supabase
            .from('household_referrals')
            .select('id, credit_cents')
            .eq('referrer_phone', normalizedPhone)
            .eq('status', 'earned')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (earned) redeemRow = { id: earned.id as string, credit_cents: (earned.credit_cents as number) ?? 500 };
        }
      } catch (e) {
        console.warn('[create-household-payment-checkout] referral lookup skipped', e);
        referralWelcome = null;
        redeemRow = null;
      }
    }

    const baseTotalCents = priceCents + serviceFeeCents;
    let referralDiscountCents = referralWelcome ? 500 : redeemRow ? Math.min(redeemRow.credit_cents, 500) : 0;
    // Keep the eventual charge at least €1 so we never trip Stripe's minimum,
    // and don't bother with sub-€1 discounts.
    referralDiscountCents = Math.min(referralDiscountCents, Math.max(0, baseTotalCents - 100));
    if (referralDiscountCents < 100) {
      referralDiscountCents = 0;
      referralWelcome = null;
      redeemRow = null;
    }

    // booking_data is built once and (only for welcome referrals) updated in
    // place after the referral row insert supplies its id.
    const bookingData: Record<string, unknown> = {
      when_label:    when_label || null,
      size_label:    sl || null,
      extra_label:   el || null,
      scheduled:     isScheduled,
      loyalty:       isLoyalty,
      note:          typeof note === 'string' ? note.trim() : null,
      source:        'task_showcase',
      service_fee_cents: serviceFeeCents,
      total_cents:       baseTotalCents,
      ...(referralDiscountCents > 0 ? {
        referral_discount_cents: referralDiscountCents,
        referral_kind: referralWelcome ? 'welcome' : 'redeem',
        ...(redeemRow ? { redeem_referral_id: redeemRow.id } : {}),
      } : {}),
    };

    // Resolve the address once, and geocode server-side when the client didn't
    // supply coordinates (e.g. the customer typed the address), so the tracking
    // map has a location to show. Best-effort — never blocks the booking.
    const resolvedAddress =
      typeof customer_address === 'string' && customer_address.trim() ? customer_address.trim()
      : typeof note === 'string' && note.trim() ? note.trim()
      : 'Not provided';
    let custLat = typeof customer_lat === 'number' && isFinite(customer_lat) ? customer_lat : null;
    let custLng = typeof customer_lng === 'number' && isFinite(customer_lng) ? customer_lng : null;
    if ((custLat === null || custLng === null) && resolvedAddress !== 'Not provided') {
      try {
        const q = [resolvedAddress, typeof city === 'string' ? city : null, 'Ireland'].filter(Boolean).join(', ');
        const geoResp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ie&q=${encodeURIComponent(q)}`,
          { headers: { 'User-Agent': 'VANO/1.0 (vanojobs.com)' } },
        );
        if (geoResp.ok) {
          const hits = await geoResp.json().catch(() => []);
          const hit = Array.isArray(hits) ? hits[0] : null;
          const lat = hit ? parseFloat(hit.lat) : NaN;
          const lng = hit ? parseFloat(hit.lon) : NaN;
          if (isFinite(lat) && isFinite(lng)) { custLat = lat; custLng = lng; }
        }
      } catch (e) { console.warn('[create-household-payment-checkout] geocode failed', e); }
    }

    // Double-submit guard: a fast double-tap on Book (or a retry) can call this
    // twice before the client disables the button. If the same phone already
    // created a live booking for the same category in the last few minutes,
    // return THAT booking instead of creating a second one (which would fan out
    // a second dispatch and could charge the customer twice).
    {
      const dedupeCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('household_bookings')
        .select('id, booking_data')
        .eq('customer_phone', customer_phone.trim())
        .eq('category', cat)
        // Same requested time too — otherwise a customer booking "Cleaning now"
        // then "Cleaning tomorrow 9am" would have the second silently swallowed.
        .eq('scheduled_date', when_label || 'flexible')
        .not('status', 'in', '(cancelled,completed)')
        .gte('created_at', dedupeCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: { id: string; booking_data: Record<string, unknown> | null } | null };
      if (recent?.id) {
        console.log('[create-household-payment-checkout] duplicate submit — returning existing booking', recent.id);
        const origin0 = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://vanojobs.com';
        const trackUrl0 = `${origin0}/track/${recent.id}`;
        const feeCents0 = Number((recent.booking_data as Record<string, unknown> | null)?.service_fee_cents) || 0;
        return new Response(
          JSON.stringify({ booking_id: recent.id, track_url: trackUrl0, checkout_url: trackUrl0, price_cents: priceCents, total_cents: priceCents + feeCents0, pay_later: true, deduped: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const { data: booking, error: insertError } = await supabase
      .from('household_bookings')
      .insert({
        customer_id: null,
        category: cat,
        scheduled_date: when_label || 'flexible',
        time_slot: null,
        is_express: false,
        price_estimate_cents: priceCents,
        status: 'pending', // live immediately — payment is requested after a helper accepts
        customer_name: customer_name.trim(),
        // Prefer the dedicated address field (quick-book sheet sends it);
        // fall back to the legacy note-as-address behaviour.
        customer_address: resolvedAddress,
        ...(custLat !== null && custLng !== null ? { customer_lat: custLat, customer_lng: custLng } : {}),
        ...(typeof city === 'string' && city.trim() ? { city: city.trim() } : {}),
        customer_phone: customer_phone.trim(),
        ...(typeof customer_email === 'string' && customer_email.trim() ? { customer_email: customer_email.trim().toLowerCase() } : {}),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        booking_data: bookingData,
      })
      .select('id')
      .single();

    if (insertError || !booking) {
      console.error('[create-household-payment-checkout] insert failed', insertError);
      return bad(500, 'Could not create booking. Please try again.');
    }

    const bookingId: string = booking.id;
    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';
    const trackUrl = `${origin}/track/${bookingId}`;
    const cityVal = typeof city === 'string' && city.trim() ? city.trim() : null;

    // Reserve the welcome referral now that the booking id exists. If this
    // fails the discount is dropped from booking_data so the pay link stays
    // honest — never block the booking itself.
    if (referralWelcome && normalizedPhone && referralDiscountCents > 0) {
      let welcomeId: string | null = null;
      try {
        const { data: refRow, error: refErr } = await supabase
          .from('household_referrals')
          .insert({
            code: referralWelcome.code,
            referrer_phone: referralWelcome.referrerPhone,
            referee_phone: normalizedPhone,
            referee_booking_id: bookingId,
            credit_cents: 500,
            status: 'pending',
          })
          .select('id')
          .single();
        if (refErr) console.warn('[create-household-payment-checkout] referral row insert failed', refErr);
        welcomeId = (refRow?.id as string | undefined) ?? null;
      } catch (e) {
        console.warn('[create-household-payment-checkout] referral row insert threw', e);
      }
      try {
        if (welcomeId) {
          bookingData.referral_welcome_id = welcomeId;
        } else {
          referralDiscountCents = 0;
          delete bookingData.referral_discount_cents;
          delete bookingData.referral_kind;
        }
        await supabase
          .from('household_bookings')
          .update({ booking_data: bookingData })
          .eq('id', bookingId);
      } catch (e) {
        console.warn('[create-household-payment-checkout] booking_data referral stamp failed', e);
      }
    }

    // Dispatch to helpers. ASAP jobs (no scheduled_at) and near-term ones go out
    // now — that's what makes the booking real. A genuinely future-dated job is
    // NOT dispatched yet: the dispatch-scheduled-jobs cron fans it out once it's
    // within the lead window, so helpers aren't offered a job days early (and it
    // isn't auto-cancelled before it's due). LEAD_MIN mirrors that cron.
    const LEAD_MIN = 90;
    const dispatchNow = !scheduledAt || (Date.parse(scheduledAt) - Date.now()) <= LEAD_MIN * 60 * 1000;
    if (dispatchNow) {
      try {
        const dispatchResp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: {
              id: bookingId, status: 'pending', city: cityVal,
              category: cat, scheduled_date: when_label || 'flexible',
              price_estimate_cents: priceCents,
            },
          }),
        });
        if (!dispatchResp.ok) {
          console.error('[create-household-payment-checkout] dispatch non-2xx', dispatchResp.status, await dispatchResp.text().catch(() => ''));
        }
      } catch (e) {
        console.error('[create-household-payment-checkout] dispatch call failed', e);
      }
    } else {
      console.log('[create-household-payment-checkout] future-dated booking — deferring dispatch to lead window', { bookingId, scheduledAt });
    }

    // Admin ping (WhatsApp + email) — used to fire from stripe-webhook on
    // payment, but payment now happens after acceptance, so notify here.
    const adminNotifyPromise = (async () => {
      const priceStr = `€${((priceCents + serviceFeeCents) / 100).toFixed(2)}`;
      const ref = bookingId.slice(-8).toUpperCase();
      const catLabel = CATEGORY_LABELS[cat];
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'new_booking',
            customer_name: customer_name.trim(),
            customer_phone: customer_phone.trim(),
            customer_email: typeof customer_email === 'string' ? customer_email.trim() : null,
            category: cat,
            scheduled_date: when_label || 'flexible',
            city: cityVal,
            price_euros: ((priceCents + serviceFeeCents) / 100).toFixed(2),
            booking_id: bookingId,
          }),
        });
      } catch (e) {
        console.warn('[create-household-payment-checkout] admin whatsapp error', e);
      }
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
        const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com';
        if (!resendKey) return;
        const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [adminEmail],
            subject: `🆕 New booking — ${catLabel} in ${cityVal ?? '?'} (${priceStr}, pay on accept)`,
            text: [
              'New booking (unpaid — customer pays once a helper accepts).',
              `Job: ${catLabel}`,
              ...(typeof note === 'string' && note.trim() ? [`Details: ${note.trim()}`] : []),
              `Customer: ${customer_name.trim()}`,
              `Phone: ${customer_phone.trim()}`,
              `City: ${cityVal ?? '—'}`,
              `When: ${when_label || 'Flexible'}`,
              `Total on accept: ${priceStr}`,
              ...(referralDiscountCents > 0 ? [`Referral discount reserved: -€${(referralDiscountCents / 100).toFixed(2)}`] : []),
              `Ref: ${ref}`,
              `Track: ${trackUrl}`,
            ].join('\n'),
          }),
        });
      } catch (e) {
        console.warn('[create-household-payment-checkout] admin email error', e);
      }
    })();

    const runtime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(adminNotifyPromise);
    else adminNotifyPromise.catch(() => {});

    // checkout_url intentionally mirrors track_url: frontends built before
    // pay-after-accept redirect to checkout_url, and the track page is the
    // correct destination now.
    return new Response(
      JSON.stringify({
        booking_id: bookingId,
        track_url: trackUrl,
        checkout_url: trackUrl,
        price_cents: priceCents,
        total_cents: priceCents + serviceFeeCents,
        ...(referralDiscountCents > 0 ? { referral_discount_cents: referralDiscountCents } : {}),
        pay_later: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-household-payment-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
