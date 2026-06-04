import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Public (no-auth) entry point for the CategoryGrid quick-booking flow.
// Validates inputs, prices the booking server-side (prevents client tampering),
// inserts an anonymous household_bookings row, then opens a Stripe Checkout
// session with automatic capture — charged immediately at checkout.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const VALID_CATEGORIES = [
  // CategoryGrid originals
  'shopping', 'dog-walk', 'garden', 'moving', 'cleaning', 'tutoring',
  // TaskShowcase own slugs (each bookable independently)
  'grocery-shopping', 'dog-walking', 'lawn-mowing', 'moving-help', 'outdoor-cleaning', 'tutoring-grinds',
  // Misc / errand slugs
  'post-office', 'pharmacy-run', 'furniture-assembly', 'tech-help', 'wait-delivery',
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
    'wait-delivery': 1000,
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
    };
    // Legacy CategoryGrid fallback
    if (!combined[sizeLabel]) return sizeLabel === '30 min' ? 1200 : 1600;
    return combined[sizeLabel];
  }

  // Lawn mowing — garden size
  if (category === 'garden' || category === 'lawn-mowing') {
    const map: Record<string, number> = {
      // legacy time-based (CategoryGrid)
      '1 hour': 2000, '2 hours': 4000, 'Half day': 7200,
      // new size-based
      'Small (terrace / apartment)': 2200,
      'Medium (semi-detached)':      3800,
      'Large (detached)':            6000,
      'Extra large':                 9000,
    };
    return map[sizeLabel] ?? null;
  }

  // Moving — job size
  if (category === 'moving' || category === 'moving-help') {
    const map: Record<string, number> = {
      // legacy time-based
      '1 hour': 2000, '2 hours': 4000, '3 hours': 6000, '4+ hours': 8000,
      // new job-size
      'A few boxes / items': 2500,
      'One room':            4000,
      '2–3 rooms':           7000,
      'Full home':           10000,
    };
    return map[sizeLabel] ?? null;
  }

  // Outdoor cleaning — area size
  if (category === 'cleaning' || category === 'outdoor-cleaning') {
    const map: Record<string, number> = {
      // legacy time-based
      '1 hour': 1800, '2 hours': 3600, '3 hours': 5400,
      // new area-based
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
    // Legacy flat rate fallback
    if (!rate[sizeLabel]) {
      const legacyMap: Record<string, number> = { '1 hour': 2200, '2 hours': 4400, '3 hours': 6600 };
      return legacyMap[sizeLabel] ?? null;
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
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const { category, when_label, size_label, extra_label, scheduled, note, customer_name, customer_phone, customer_email, city } = body;

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
      const { count: loyaltyCount } = await supabase
        .from('household_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('customer_phone', customer_phone.trim())
        .not('status', 'in', '(awaiting_payment,cancelled)');
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
        status: 'awaiting_payment',
        customer_name: customer_name.trim(),
        customer_address: typeof note === 'string' && note.trim() ? note.trim() : 'Not provided',
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

    const checkoutParams: Record<string, string> = {
      mode: 'payment',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(priceCents),
      'line_items[0][price_data][product_data][name]': `VANO — ${CATEGORY_LABELS[cat]}`,
      'line_items[0][price_data][product_data][description]': [
        when_label || null,
        sl || null,
        el || null,
        isScheduled ? 'Scheduled (10% off)' : null,
        isLoyalty   ? '🎉 Loyalty reward (50% off)' : null,
        city || null,
      ].filter(Boolean).join(' · ') || 'Ireland',
      'line_items[0][quantity]': '1',
      ...(serviceFeeCents > 0 ? {
        'line_items[1][price_data][currency]': 'eur',
        'line_items[1][price_data][unit_amount]': String(serviceFeeCents),
        'line_items[1][price_data][product_data][name]': 'VANO service fee',
        'line_items[1][price_data][product_data][description]': 'Platform fee — keeps VANO running',
        'line_items[1][quantity]': '1',
      } : {}),
      'payment_intent_data[capture_method]': 'automatic',
      'payment_intent_data[metadata][household_booking_id]': bookingId,
      'phone_number_collection[enabled]': 'true',
      ...(typeof customer_email === 'string' && customer_email.trim() ? { customer_email: customer_email.trim().toLowerCase() } : {}),
      success_url: `${origin}/track/${bookingId}?paid=true`,
      cancel_url: `${origin}/`,
      'metadata[household_booking_id]': bookingId,
      client_reference_id: bookingId,
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(checkoutParams),
    });

    if (!stripeResp.ok) {
      const text = await stripeResp.text();
      console.error('[create-household-payment-checkout] stripe error', stripeResp.status, text);
      await supabase.from('household_bookings').delete().eq('id', bookingId);
      return bad(502, 'Payment provider error. Please try again.');
    }

    const session = await stripeResp.json() as { id: string; url: string };

    await supabase
      .from('household_bookings')
      .update({ stripe_payment_intent_id: session.id })
      .eq('id', bookingId);

    return new Response(
      JSON.stringify({ booking_id: bookingId, checkout_url: session.url, price_cents: priceCents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-household-payment-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
