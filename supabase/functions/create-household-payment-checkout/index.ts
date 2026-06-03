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
  'shopping', 'dog-walk', 'garden', 'moving', 'cleaning',
  'tutoring', 'post-office', 'furniture-assembly', 'tech-help', 'wait-delivery',
] as const;
type Category = typeof VALID_CATEGORIES[number];

function computePriceCents(category: Category, sizeLabel: string): number | null {
  if (category === 'shopping')      return 1500; // €15 flat
  if (category === 'post-office')   return 1000; // €10 flat
  if (category === 'wait-delivery') return 1000; // €10 flat
  if (category === 'dog-walk') {
    return sizeLabel === '30 min' ? 1500 : 2000; // €15 or €20 (1 dog; quick flow)
  }
  const key = `${category}|${sizeLabel}`;
  const map: Record<string, number> = {
    // Garden — €18/hr; half-day = 4hrs = €72
    'garden|1 hour': 1800,   'garden|2 hours': 3600,   'garden|Half day': 7200,
    // Moving — €18/hr (1 helper assumed; multi-helper via WhatsApp)
    'moving|1 hour': 1800,   'moving|2 hours': 3600,   'moving|3 hours': 5400,  'moving|4+ hours': 7200,
    // Cleaning — €16/hr
    'cleaning|1 hour': 1600, 'cleaning|2 hours': 3200, 'cleaning|3 hours': 4800,
    // Tutoring — €15/hr
    'tutoring|1 hour': 1500, 'tutoring|2 hours': 3000, 'tutoring|3 hours': 4500,
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
  tutoring: 'Tutoring',
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
    const { category, when_label, size_label, note, customer_name, customer_phone, customer_email, city } = body;

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
        ...(typeof customer_email === 'string' && customer_email.trim() ? { customer_email: customer_email.trim().toLowerCase() } : {}),
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
