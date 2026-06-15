import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Household "mark done" — the customer taps it on their tracking screen to
// confirm a one-off job is finished. Like customer_cancel in
// cancel-household-booking, this is unauthenticated and gated by status: the
// booking link is the credential (customers are usually anonymous). It only
// completes a job that's actually 'in_progress', then delegates to
// capture-household-payment over the internal service-role path so all the
// payout + email + notify logic lives in one place.
//
// verify_jwt = false (set in config.toml) — anonymous customers must be able
// to reach it.

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, status')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; status: string } | null; error: unknown };

    if (fetchErr || !booking) return bad(404, 'Booking not found');
    if (booking.status === 'completed') {
      return new Response(JSON.stringify({ success: true, already_complete: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (booking.status !== 'in_progress') {
      return bad(409, 'This job can only be marked done once it has started.');
    }

    // Delegate the actual completion (status flip + released payout + emails +
    // notifications) to capture-household-payment via the internal path.
    const resp = await fetch(`${supabaseUrl}/functions/v1/capture-household-payment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-complete': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[complete-household-job] capture failed', resp.status, payload);
      return bad(502, 'Could not complete the job. Please try again.');
    }
    return new Response(JSON.stringify({ success: true, ...payload }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[complete-household-job] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
