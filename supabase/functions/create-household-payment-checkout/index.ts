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
] as const;
type Category = typeof VALID_CATEGORIES[number];

function computePriceCents(category: Category, sizeLabel: string, extraLabel: string): number | null {
  // Flat-rate errand services
  const flat: Partial<Record<Category, number>> = {
    'shopping':      1500,
    'post-office':   1000,
    'pharmacy-run':  1000,
    'wait-delivery': 1000,
  };
  if (category in flat) return flat[category]!;

  // Grocery shopping — tiered by list size
  if (category === 'grocery-shopping') {
    const map: Record<string, number> = {
      'Quick errand (a few items)': 1000,
      'Regular shop':               1500,
      'Big weekly shop':            2200,
    };
    return map[sizeLabel] ?? null;
  }

  // Dog walking — duration base + per extra dog
  if (category === 'dog-walk' || category === 'dog-walking') {
    const base: Record<string, number> = {
      '30 min':  1200,
      '1 hour':  1600,
      '2 hours': 2200,
    };
    // Legacy CategoryGrid flow had no extra_label — default to 1 dog
    const dogBonus: Record<string, number> = { '1 dog': 0, '2 dogs': 400, '3+ dogs': 800 };
    const b = base[sizeLabel] ?? (sizeLabel === '30 min' ? 1200 : 1600);
    const d = dogBonus[extraLabel] ?? 0;
    if (b === undefined) return null;
    return b + d;
  }

  // Tutoring — duration × level rate
  if (category === 'tutoring' || category === 'tutoring-grinds') {
    const rate: Record<string, number> = {
      'Primary school': 2200,
      'Junior Cert':    2800,
      'Leaving Cert':   3200,
      'College / Uni':  3800,
    };
    const hrs: Record<string, number> = { '1 hour': 1, '2 hours': 2, '3 hours': 3 };
    const r = rate[extraLabel] ?? 2200; // default Primary if no level given (legacy)
    const h = hrs[sizeLabel];
    if (h === undefined) return null;
    return r * h;
  }

  // Hourly services
  const key = `${category}|${sizeLabel}`;
  const map: Record<string, number> = {
    // Garden / lawn mowing — €20/hr
    'garden|1 hour': 2000,        'garden|2 hours': 4000,       'garden|Half day': 7200,
    'lawn-mowing|1 hour': 2000,   'lawn-mowing|2 hours': 4000,  'lawn-mowing|Half day': 7200,
    // Moving — €20/hr
    'moving|1 hour': 2000,        'moving|2 hours': 4000,       'moving|3 hours': 6000,       'moving|4+ hours': 8000,
    'moving-help|1 hour': 2000,   'moving-help|2 hours': 4000,  'moving-help|3 hours': 6000,  'moving-help|4+ hours': 8000,
    // Cleaning / outdoor cleaning — €18/hr
    'cleaning|1 hour': 1800,         'cleaning|2 hours': 3600,         'cleaning|3 hours': 5400,
    'outdoor-cleaning|1 hour': 1800, 'outdoor-cleaning|2 hours': 3600, 'outdoor-cleaning|3 hours': 5400,
    // Furniture assembly — €20/hr
    'furniture-assembly|1 hour': 2000, 'furniture-assembly|2 hours': 4000, 'furniture-assembly|3 hours': 6000,
    // Tech help — €25/hr
    'tech-help|1 hour': 2500, 'tech-help|2 hours': 5000,
  };
  return map[key] ?? null;
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
    const { category, when_label, size_label, extra_label, note, customer_name, customer_phone, customer_email, city } = body;

    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      return bad(400, 'Invalid category');
    }
    if (!customer_name?.trim()) return bad(400, 'customer_name is required');
    if (!customer_phone?.trim()) return bad(400, 'customer_phone is required');

    const cat = category as Category;
    const sl  = typeof size_label  === 'string' ? size_label  : '';
    const el  = typeof extra_label === 'string' ? extra_label : '';
    const priceCents = computePriceCents(cat, sl, el);
    if (!priceCents) {
      return bad(400, `No price available for ${category} / ${sl}${el ? ' / ' + el : ''}`);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

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
          when_label:  when_label || null,
          size_label:  sl || null,
          extra_label: el || null,
          note:        typeof note === 'string' ? note.trim() : null,
          source:      'category_grid',
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
      'line_items[0][price_data][product_data][description]': when_label
        ? `${when_label}${sl ? ' · ' + sl : ''}${el ? ' · ' + el : ''}${city ? ' · ' + city : ''}`
        : (city ?? 'Ireland'),
      'line_items[0][quantity]': '1',
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
