import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Triggered by a Supabase Database Webhook on household_bookings when
// status changes to 'pending' (i.e. after Stripe payment completes).
//
// Flow:
//   1. Receive booking payload from webhook.
//   2. Find approved + available helpers in the same city.
//   3. Offer the job to up to MAX_OFFERS helpers (ordered by fewest accepted jobs).
//   4. Insert household_job_offers rows — helpers see these on their dashboard.
//
// When a helper accepts (via /student-job/:bookingId):
//   - Set household_bookings.student_id and status = 'accepted'
//   - Expire remaining offers for that booking (handled in the accept endpoint)

const MAX_OFFERS = 3;
const OFFER_TTL_MINUTES = 15;

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const payload = await req.json();

    // Supabase DB webhooks send { type, table, record, old_record }
    const booking = payload?.record ?? payload;
    const { id: bookingId, city, status } = booking;

    if (status !== 'pending') {
      return new Response('Not a pending booking — skipping', { status: 200 });
    }
    if (!bookingId || !city) {
      return new Response('Missing booking id or city', { status: 400 });
    }

    // Check there are no existing offers for this booking (idempotency guard)
    const { count: existingOffers } = await supabase
      .from('household_job_offers')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .neq('status', 'expired');

    if (existingOffers && existingOffers > 0) {
      return new Response('Offers already sent', { status: 200 });
    }

    // Find available approved helpers in this city, fewest jobs first
    const { data: helpers, error: helpersError } = await supabase
      .from('household_helpers')
      .select('id')
      .eq('city', city)
      .eq('status', 'approved')
      .eq('is_available', true)
      .order('accepted_count', { ascending: true })
      .limit(MAX_OFFERS);

    if (helpersError) {
      console.error('[dispatch] helpers query error', helpersError);
      return new Response('DB error', { status: 500 });
    }

    if (!helpers || helpers.length === 0) {
      console.warn(`[dispatch] no available helpers in ${city} for booking ${bookingId}`);
      return new Response('No helpers available', { status: 200 });
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000).toISOString();

    const offers = helpers.map((h: { id: string }) => ({
      booking_id: bookingId,
      helper_id: h.id,
      expires_at: expiresAt,
      status: 'pending',
    }));

    const { error: insertError } = await supabase
      .from('household_job_offers')
      .insert(offers);

    if (insertError) {
      console.error('[dispatch] insert offers error', insertError);
      return new Response('Failed to insert offers', { status: 500 });
    }

    console.log(`[dispatch] offered booking ${bookingId} to ${offers.length} helper(s) in ${city}`);
    return new Response(
      JSON.stringify({ dispatched: offers.length, city, bookingId }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dispatch] unhandled error', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
