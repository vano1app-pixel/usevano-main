import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Captures an authorized Stripe PaymentIntent for a completed household job.
//
// Called when:
//   - A student marks a job as completed (status → completed)
//   - An admin manually releases payment
//
// Guards:
//   - Caller must be the assigned student OR a service-role call
//   - Booking must be in 'in_progress' or 'completed' status
//   - stripe_payment_intent_id must be set (webhook stamped it after checkout)

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const callerId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the booking
    const { data: booking, error: fetchError } = await supabase
      .from('household_bookings')
      .select('id, student_id, customer_id, status, stripe_payment_intent_id, price_estimate_cents')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !booking) return bad(404, 'Booking not found');

    // Must be the assigned student
    if (booking.student_id !== callerId) return bad(403, 'Not the assigned student');

    // Must be in a capturable state
    if (!['accepted', 'on_way', 'arrived', 'in_progress'].includes(booking.status)) {
      return bad(409, `Cannot capture payment in status: ${booking.status}`);
    }

    if (!booking.stripe_payment_intent_id) {
      return bad(409, 'No payment intent found — webhook may not have fired yet');
    }

    // Capture the PaymentIntent
    const captureResp = await fetch(
      `https://api.stripe.com/v1/payment_intents/${booking.stripe_payment_intent_id}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (!captureResp.ok) {
      const text = await captureResp.text();
      console.error('[capture-household-payment] stripe error', captureResp.status, text);
      return bad(502, 'Payment capture failed. Please try again.');
    }

    const pi = await captureResp.json() as { id: string; status: string };

    // Mark booking completed
    const { error: updateError } = await supabase
      .from('household_bookings')
      .update({ status: 'completed' })
      .eq('id', bookingId)
      .eq('student_id', callerId);

    if (updateError) {
      console.error('[capture-household-payment] booking update failed', updateError);
      return bad(500, 'Payment captured but booking status update failed. Contact support.');
    }

    // Create the payout row (pending — actual transfer happens via weekly batch or manual release)
    const PLATFORM_FEE_BPS = 500; // 5% platform fee
    const priceCents = booking.price_estimate_cents ?? 0;
    const studentCents = Math.floor(priceCents * (10000 - PLATFORM_FEE_BPS) / 10000);

    await supabase.from('household_payouts').insert({
      booking_id: bookingId,
      student_id: callerId,
      amount_cents: studentCents,
      status: 'pending',
    });

    // Insert a completed job update
    await supabase.from('household_job_updates').insert({
      booking_id: bookingId,
      status: 'completed',
      note: 'Job completed and payment captured.',
    });

    return new Response(
      JSON.stringify({ success: true, payment_intent_status: pi.status, student_earns_cents: studentCents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[capture-household-payment] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
