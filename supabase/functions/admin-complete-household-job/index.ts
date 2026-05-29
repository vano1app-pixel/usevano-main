import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Admin endpoint to mark a household job complete and capture the Stripe payment.
//
// Called from the /admin dashboard when an operator manually completes a job.
// Unlike capture-household-payment (which requires the assigned student's JWT),
// this accepts any verified admin session.
//
// Guards:
//   1. Valid Supabase JWT required.
//   2. Caller must have the 'admin' role in user_roles.
//   3. Booking must be in a capturable state (pending → in_progress).
//   4. stripe_payment_intent_id must exist (payment was made).
//
// On success:
//   - Stripe PaymentIntent is captured (money moves).
//   - household_bookings status → 'completed'.
//   - household_job_updates row inserted.
//   - household_payouts row inserted (if a student is assigned).

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const CAPTURABLE_STATUSES = ['pending', 'accepted', 'on_way', 'arrived', 'in_progress'];
const PLATFORM_FEE_BPS = 500; // 5%

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the JWT and get the caller's user id
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const callerId = claimsData.claims.sub as string;

    // Check admin role via service-role client (bypasses RLS on user_roles)
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) return bad(403, 'Admin access required');

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id.trim() : null;
    if (!bookingId) return bad(400, 'booking_id required');

    // Fetch the booking
    const { data: booking, error: fetchError } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, stripe_payment_intent_id, price_estimate_cents')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !booking) return bad(404, 'Booking not found');

    if (!CAPTURABLE_STATUSES.includes(booking.status)) {
      return bad(409, `Cannot complete booking in status: ${booking.status}`);
    }

    if (!booking.stripe_payment_intent_id) {
      return bad(409, 'No payment found — Stripe webhook may not have fired yet');
    }

    // Resolve the actual PaymentIntent ID.
    // After the webhook fires, stripe_payment_intent_id holds the pi_xxx.
    // Before the webhook (edge case), it holds the cs_xxx checkout session id.
    let piId = booking.stripe_payment_intent_id as string;

    if (piId.startsWith('cs_')) {
      // Fetch the checkout session from Stripe to get the real PI
      const sessionResp = await fetch(`https://api.stripe.com/v1/checkout/sessions/${piId}`, {
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      });
      if (!sessionResp.ok) {
        return bad(502, 'Could not retrieve Stripe checkout session');
      }
      const session = await sessionResp.json() as { payment_intent?: string };
      if (!session.payment_intent) {
        return bad(409, 'Stripe checkout session has no payment intent — payment may not have completed');
      }
      piId = session.payment_intent;
    }

    // Capture the PaymentIntent
    const captureResp = await fetch(
      `https://api.stripe.com/v1/payment_intents/${piId}/capture`,
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
      console.error('[admin-complete] stripe capture error', captureResp.status, text);

      // Already captured is fine (idempotent)
      if (!text.includes('already_captured')) {
        return bad(502, 'Payment capture failed. Check the Stripe dashboard.');
      }
    }

    // Mark booking completed
    const { error: updateError } = await supabase
      .from('household_bookings')
      .update({ status: 'completed', stripe_payment_intent_id: piId })
      .eq('id', bookingId);

    if (updateError) {
      console.error('[admin-complete] booking update failed', updateError);
      return bad(500, 'Payment captured but booking update failed. Contact support with booking ID.');
    }

    // Audit trail
    await supabase.from('household_job_updates').insert({
      booking_id: bookingId,
      status: 'completed',
      note: `Completed and payment captured by admin (${callerId.slice(0, 8)}).`,
    });

    // Payout row — only if a student is assigned
    let studentEarnsCents: number | null = null;
    if (booking.student_id) {
      const priceCents = booking.price_estimate_cents ?? 0;
      studentEarnsCents = Math.floor(priceCents * (10000 - PLATFORM_FEE_BPS) / 10000);
      await supabase.from('household_payouts').insert({
        booking_id: bookingId,
        student_id: booking.student_id,
        amount_cents: studentEarnsCents,
        status: 'pending',
      });
    }

    return new Response(
      JSON.stringify({ success: true, booking_id: bookingId, student_earns_cents: studentEarnsCents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[admin-complete] unhandled error', err);
    return bad(500, 'Unexpected error');
  }
});
