import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"; // service-role only
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Creates a household_bookings row (status=awaiting_payment) and a
// Stripe Checkout Session with automatic capture.
//
// Flow:
//   1. Customer fills out booking wizard and submits.
//   2. This function validates + writes the booking row, then opens
//      a Stripe Checkout session (automatic capture — charged immediately).
//   3. Customer pays → Stripe fires checkout.session.completed webhook.
//   4. stripe-webhook flips status awaiting_payment → pending and pings admin.
//
// Prices are computed server-side from booking_data to prevent
// client-side tampering.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

interface BookingData {
  category: string;
  store?: string;
  shoppingList?: string;
  dogCount?: number;
  walkDuration?: string;
  gardenTasks?: string[];
  gardenDuration?: string;
  helperCount?: number;
  movingDuration?: string;
  fromAddress?: string;
  toAddress?: string;
  movingDescription?: string;
  cleaningDuration?: string;
  cleaningTasks?: string[];
  pricingType?: string;
  description?: string;
}

function computePriceCents(data: BookingData, isExpress: boolean): number {
  switch (data.category) {
    case 'shopping':
      return isExpress ? 2500 : 1500; // €25 express, €15 standard
    case 'dog-walk': {
      // €15/dog for 30min, €20/dog for 1hr
      const base = data.walkDuration === '30min' ? 1500 : 2000;
      const dogs = Math.max(1, Number(data.dogCount) || 1);
      return base * dogs;
    }
    case 'garden': {
      // €18/hr; half-day is 4hrs = €72 (was €54 which undervalued student time)
      const prices: Record<string, number> = { '1hr': 1800, '2hr': 3600, 'half-day': 7200 };
      return prices[data.gardenDuration ?? '1hr'] ?? 1800;
    }
    case 'moving': {
      // €18/hr per helper; UI sends '1hr','2hr','3hr','4hr'
      const base: Record<string, number> = { '1hr': 1800, '2hr': 3600, '3hr': 5400, '4hr': 7200 };
      const perHelper = base[data.movingDuration ?? '2hr'] ?? 3600;
      const helpers = Math.max(1, Number(data.helperCount) || 1);
      return perHelper * helpers;
    }
    case 'cleaning': {
      const prices: Record<string, number> = { '1hr': 1600, '2hr': 3200, '3hr': 4800 };
      return prices[data.cleaningDuration ?? '1hr'] ?? 1600;
    }
    case 'other':
      // flat = €15 short task; hourly = €25 (reflects ~1.5hr open-ended task)
      return data.pricingType === 'hourly' ? 2500 : 1500;
    default:
      return 1500;
  }
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    shopping: 'Shopping run',
    'dog-walk': 'Dog walk',
    garden: 'Garden help',
    moving: 'Moving help',
    cleaning: 'Cleaning',
    other: 'General help',
  };
  return labels[cat] ?? 'Household help';
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const SUPPORTED_CITIES = ['Galway', 'Dublin', 'Cork', 'Limerick'];

    const body = await req.json().catch(() => ({}));
    const { category, scheduled_date, time_slot, is_express, city, booking_data,
            customer_name, customer_address, customer_phone } = body;

    // Validate required fields
    if (!category || !scheduled_date || !time_slot) return bad(400, 'Missing required fields');
    if (!customer_name?.trim() || !customer_address?.trim() || !customer_phone?.trim()) {
      return bad(400, 'Missing customer details');
    }
    if (!['morning', 'afternoon', 'evening'].includes(time_slot)) {
      return bad(400, 'Invalid time_slot');
    }
    if (!city || !SUPPORTED_CITIES.includes(city)) {
      return bad(400, 'Invalid or missing city');
    }

    const bookingData: BookingData = { category, ...(booking_data ?? {}) };
    const priceCents = computePriceCents(bookingData, !!is_express);

    const supabase = createClient(supabaseUrl, serviceKey);

    // Create the booking row in awaiting_payment state (customer_id NULL = anonymous)
    const { data: booking, error: insertError } = await supabase
      .from('household_bookings')
      .insert({
        customer_id: null,
        category,
        scheduled_date,
        time_slot,
        is_express: !!is_express,
        city,
        price_estimate_cents: priceCents,
        status: 'awaiting_payment',
        customer_name: customer_name.trim(),
        customer_address: customer_address.trim(),
        customer_phone: customer_phone.trim(),
        booking_data: bookingData,
      })
      .select('id')
      .single();

    if (insertError || !booking) {
      console.error('[create-household-booking] insert failed', insertError);
      return bad(500, 'Could not create booking. Please try again.');
    }

    const bookingId: string = booking.id;
    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    // Stripe Checkout Session — manual capture so we only authorize the
    // card now and capture when the student marks the job complete.
    const checkoutParams: Record<string, string> = {
      mode: 'payment',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(priceCents),
      'line_items[0][price_data][product_data][name]': `VANO — ${categoryLabel(category)}`,
      'line_items[0][price_data][product_data][description]':
        `${scheduled_date === 'today' ? 'Today' : scheduled_date === 'tomorrow' ? 'Tomorrow' : scheduled_date} · ${time_slot}`,
      'line_items[0][quantity]': '1',
      'payment_intent_data[capture_method]': 'automatic',
      'payment_intent_data[metadata][household_booking_id]': bookingId,
      success_url: `${origin}/track/${bookingId}?paid=true`,
      cancel_url: `${origin}/book/${category}`,
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
      console.error('[create-household-booking] stripe error', stripeResp.status, text);
      // Clean up the booking row so the customer can retry cleanly
      await supabase.from('household_bookings').delete().eq('id', bookingId);
      return bad(502, 'Payment provider error. Please try again.');
    }

    const session = await stripeResp.json() as { id: string; url: string };

    // Stamp the Stripe session id so the webhook can find this row
    await supabase
      .from('household_bookings')
      .update({ stripe_payment_intent_id: session.id }) // session.id at checkout, PI id comes via webhook
      .eq('id', bookingId);

    return new Response(
      JSON.stringify({ booking_id: bookingId, checkout_url: session.url, price_cents: priceCents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-household-booking] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
