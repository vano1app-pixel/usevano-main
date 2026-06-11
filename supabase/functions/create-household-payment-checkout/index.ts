import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Inlined CORS ──────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────

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

  // Cleaning — hour labels must match the CategoryGrid sheet (€16/hr × 1–8h)
  if (category === 'cleaning' || category === 'outdoor-cleaning') {
    const map: Record<string, number> = {
      // time-based (CategoryGrid)
      '1 hour': 1600,  '2 hours': 3200, '3 hours': 4800,  '4 hours': 6400,
      '5 hours': 8000, '6 hours': 9600, '7 hours': 11200, '8 hours': 12800,
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

  // Tutoring — level (sizeLabel) × duration (extraLabel)
  if (category === 'tutoring' || category === 'tutoring-grinds') {
    const rate: Record<string, number> = {
      'Primary school': 2200,
      'Junior Cert':    2800,
      'Leaving Cert':   3200,
      'College / Uni':  3800,
    };
    const hrs: Record<string, number> = { '1 hour': 1, '2 hours': 2, '3 hours': 3 };
    // CategoryGrid quick-book sends plain hour labels — €15/hr × 1–8h, must match the sheet
    if (!rate[sizeLabel]) {
      const hourMap: Record<string, number> = {
        '1 hour': 1500,  '2 hours': 3000, '3 hours': 4500,  '4 hours': 6000,
        '5 hours': 7500, '6 hours': 9000, '7 hours': 10500, '8 hours': 12000,
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
  shopping:             'Shopping run',
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
    const { category, when_label, size_label, extra_label, scheduled, note, customer_name, customer_phone, customer_email, customer_address, customer_lat, customer_lng, city } = body;

    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      return bad(400, 'Invalid category');
    }
    if (!customer_name?.trim()) return bad(400, 'customer_name is required');
    if (!customer_phone?.trim()) return bad(400, 'customer_phone is required');

    const cat = category as Category;
    const sl  = typeof size_label  === 'string' ? size_label  : '';
    const el  = typeof extra_label === 'string' ? extra_label : '';
    const isScheduled = scheduled === true;

    let priceCents = computePriceCents(cat, sl, el);
    if (!priceCents) {
      return bad(400, `No price available for ${category} / ${sl}${el ? ' / ' + el : ''}`);
    }
    const isMonthlyPlan = cat.startsWith('airbnb-');

    // Schedule and loyalty discounts don't apply to monthly Airbnb plans
    if (!isMonthlyPlan && isScheduled) priceCents = Math.round(priceCents * 0.9);

    const SERVICE_FEE_PCT  = 0.05; // 5% — raise this as platform grows
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
        customer_address:
          typeof customer_address === 'string' && customer_address.trim() ? customer_address.trim()
          : typeof note === 'string' && note.trim() ? note.trim()
          : 'Not provided',
        ...(typeof customer_lat === 'number' && typeof customer_lng === 'number' &&
            isFinite(customer_lat) && isFinite(customer_lng)
          ? { customer_lat, customer_lng } : {}),
        ...(typeof city === 'string' && city.trim() ? { city: city.trim() } : {}),
        customer_phone: customer_phone.trim(),
        ...(typeof customer_email === 'string' && customer_email.trim() ? { customer_email: customer_email.trim().toLowerCase() } : {}),
        booking_data: {
          when_label:    when_label || null,
          size_label:    sl || null,
          extra_label:   el || null,
          scheduled:     isScheduled,
          loyalty:       isLoyalty,
          note:          typeof note === 'string' ? note.trim() : null,
          source:        'task_showcase',
          service_fee_cents: serviceFeeCents,
          total_cents:       priceCents + serviceFeeCents,
        },
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

    // Dispatch to helpers right away — this is what makes the booking real.
    // Awaited so a dispatch failure is at least logged before we respond.
    try {
      const dispatchResp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record: {
            id: bookingId, status: 'pending', city: cityVal,
            category: cat, scheduled_date: when_label || 'flexible',
          },
        }),
      });
      if (!dispatchResp.ok) {
        console.error('[create-household-payment-checkout] dispatch non-2xx', dispatchResp.status, await dispatchResp.text().catch(() => ''));
      }
    } catch (e) {
      console.error('[create-household-payment-checkout] dispatch call failed', e);
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
              `Customer: ${customer_name.trim()}`,
              `Phone: ${customer_phone.trim()}`,
              `City: ${cityVal ?? '—'}`,
              `When: ${when_label || 'Flexible'}`,
              `Total on accept: ${priceStr}`,
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
        pay_later: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-household-payment-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
