import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"; // service-role only
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Creates a household_bookings row as status='pending' and dispatches it to
// helpers immediately — no upfront payment (pay-after-accept).
//
// Flow:
//   1. Customer fills out booking wizard and submits.
//   2. This function validates + writes the booking row, then triggers
//      dispatch-household-job so helpers get the offer straight away.
//   3. A helper accepts → notify-household-accepted creates the Stripe
//      Checkout session and emails the customer the pay link.
//   4. Customer pays → stripe-webhook stamps paid_at on the booking.
//
// Prices are computed server-side from booking_data to prevent
// client-side tampering.

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

    // Extract customer coordinates from booking_data if provided by the address picker
    const customerLat = typeof booking_data?.customerLat === 'number' ? booking_data.customerLat : null;
    const customerLng = typeof booking_data?.customerLng === 'number' ? booking_data.customerLng : null;

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
        status: 'pending', // live immediately — payment is requested after a helper accepts
        customer_name: customer_name.trim(),
        customer_address: customer_address.trim(),
        customer_phone: customer_phone.trim(),
        booking_data: bookingData,
        ...(customerLat !== null && customerLng !== null ? { customer_lat: customerLat, customer_lng: customerLng } : {}),
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
    const trackUrl = `${origin}/track/${bookingId}`;

    // Dispatch to helpers right away — this is what makes the booking real.
    try {
      const dispatchResp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          record: { id: bookingId, status: 'pending', city, category, scheduled_date, price_estimate_cents: priceCents },
        }),
      });
      if (!dispatchResp.ok) {
        console.error('[create-household-booking] dispatch non-2xx', dispatchResp.status, await dispatchResp.text().catch(() => ''));
      }
    } catch (e) {
      console.error('[create-household-booking] dispatch call failed', e);
    }

    // Admin ping — payment now happens after acceptance, so notify on creation.
    const adminNotifyPromise = (async () => {
      const ref = bookingId.slice(-8).toUpperCase();
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'new_booking',
            customer_name: customer_name.trim(),
            customer_phone: customer_phone.trim(),
            category,
            scheduled_date,
            city,
            price_euros: (priceCents / 100).toFixed(2),
            booking_id: bookingId,
          }),
        });
      } catch (e) {
        console.warn('[create-household-booking] admin whatsapp error', e);
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
            subject: `🆕 New booking — ${categoryLabel(category)} in ${city} (€${(priceCents / 100).toFixed(2)}, pay on accept)`,
            text: [
              'New booking (unpaid — customer pays once a helper accepts).',
              `Job: ${categoryLabel(category)}`,
              `Customer: ${customer_name.trim()}`,
              `Phone: ${customer_phone.trim()}`,
              `City: ${city}`,
              `When: ${scheduled_date} · ${time_slot}`,
              `Total on accept: €${(priceCents / 100).toFixed(2)}`,
              `Ref: ${ref}`,
              `Track: ${trackUrl}`,
            ].join('\n'),
          }),
        });
      } catch (e) {
        console.warn('[create-household-booking] admin email error', e);
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
        pay_later: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-household-booking] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
