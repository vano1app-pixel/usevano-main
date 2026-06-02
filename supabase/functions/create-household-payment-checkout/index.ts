import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Public (no-auth) entry point for the CategoryGrid quick-booking flow.
// Validates inputs, prices the booking server-side (prevents client tampering),
// inserts an anonymous household_bookings row, then opens a Stripe Checkout
// session with manual capture so the card is only charged when the student
// marks the job complete (via capture-household-payment).
//
// Requires the 20260522000000_household_anonymous_bookings migration to be
// applied first (makes customer_id and time_slot nullable, adds
// 'awaiting_payment' to the status enum).

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const VALID_CATEGORIES = [
  'shopping', 'dog-walk', 'garden', 'moving', 'cleaning',
  'post-office', 'furniture-assembly', 'tech-help', 'wait-delivery',
] as const;
type Category = typeof VALID_CATEGORIES[number];

function computePriceCents(category: Category, sizeLabel: string): number | null {
  if (category === 'shopping')      return 1200; // €12 flat
  if (category === 'post-office')   return 1000; // €10 flat
  if (category === 'wait-delivery') return 1000; // €10 flat
  if (category === 'dog-walk') {
    // 30-min walk = €15, 1-hour walk = €20 (default)
    return sizeLabel === '30 min' ? 1500 : 2000;
  }
  const key = `${category}|${sizeLabel}`;
  const map: Record<string, number> = {
    // Garden — €18/hr
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|Half day': 5400,
    // Moving — €18/hr per helper (duration only; helper count handled client-side)
    'moving|2 hours': 3600,  'moving|Half day': 5400,  'moving|Full day': 10800,
    // Cleaning — €16/hr
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200, 'cleaning|3 hours': 4800,
    // Furniture assembly — €15/hr
    'furniture-assembly|1 hour': 1500, 'furniture-assembly|2 hours': 3000, 'furniture-assembly|3 hours': 4500,
    // Tech help — €15/hr
    'tech-help|1 hour': 1500, 'tech-help|2 hours': 3000,
  };
  return map[key] ?? null;
}

const CATEGORY_LABELS: Record<Category, string> = {
  shopping: 'Shopping run',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  'post-office': 'Post office run',
  'furniture-assembly': 'Furniture assembly',
  'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery',
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
    const { category, when_label, size_label, note, customer_name, customer_phone, city } = body;

    // Validate
    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      return bad(400, 'Invalid category');
    }
    if (!customer_name?.trim()) return bad(400, 'customer_name is required');
    if (!customer_phone?.trim()) return bad(400, 'customer_phone is required');

    const cat = category as Category;
    const sl = typeof size_label === 'string' ? size_label : '';
    const priceCents = computePriceCents(cat, sl);
    if (!priceCents) {
      return bad(400, `No price available for ${category} / ${sl}`);
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
        booking_data: {
          when_label: when_label || null,
          size_label: sl || null,
          note: typeof note === 'string' ? note.trim() : null,
          source: 'category_grid',
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
        ? `${when_label}${sl ? ' · ' + sl : ''}${city ? ' · ' + city : ''}`
        : (city ?? 'Ireland'),
      'line_items[0][quantity]': '1',
      // Authorise only — capture fires when the student marks the job complete
      'payment_intent_data[capture_method]': 'manual',
      'payment_intent_data[metadata][household_booking_id]': bookingId,
      'phone_number_collection[enabled]': 'true',
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
