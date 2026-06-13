import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron (every 15 min): finds live bookings whose offers have ALL expired and
// pushes them back through dispatch-household-job so jobs never die quietly.
//
// Replaces the old household_redispatch_stuck() SQL function, which embedded
// a stale service-role JWT in its source and whose pg_net calls timed out at
// the 5s default before dispatch ever ran — the silent failure that left a
// real customer stranded for hours.
//
// Caps: bookings younger than 48h, at most ROUND_CAP re-dispatch rounds per
// booking (tracked in booking_data.redispatch_round). After the cap, the
// no-helper/admin fallbacks own the booking.

const ROUND_CAP = 3;
const MIN_AGE_MINUTES = 20;   // give the first dispatch's TTL a head start
const MAX_AGE_HOURS = 48;
const BATCH = 10;

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const now = Date.now();
    const minCreated = new Date(now - MAX_AGE_HOURS * 3600_000).toISOString();
    const maxCreated = new Date(now - MIN_AGE_MINUTES * 60_000).toISOString();

    // Unclaimed live bookings in the redispatch window
    const { data: candidates, error } = await supabase
      .from('household_bookings')
      .select('id, city, category, scheduled_date, price_estimate_cents, booking_data, created_at')
      .eq('status', 'pending')
      .is('student_id', null)
      .gte('created_at', minCreated)
      .lte('created_at', maxCreated)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[redispatch] booking query failed', error);
      return new Response('DB error', { status: 500 });
    }

    let redispatched = 0;
    const skipped: string[] = [];

    for (const b of candidates ?? []) {
      if (redispatched >= BATCH) break;

      const bookingData = (b.booking_data ?? {}) as Record<string, unknown>;
      const round = Number(bookingData.redispatch_round) || 0;
      if (round >= ROUND_CAP) { skipped.push(`${b.id}:round_cap`); continue; }

      // Only step in once every offer for this booking has expired
      const { count: liveOffers } = await supabase
        .from('household_job_offers')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', b.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (liveOffers && liveOffers > 0) { skipped.push(`${b.id}:live_offers`); continue; }

      // Bump the round BEFORE dispatching so a crash can't cause infinite loops
      const { error: bumpErr } = await supabase
        .from('household_bookings')
        .update({ booking_data: { ...bookingData, redispatch_round: round + 1 } })
        .eq('id', b.id);
      if (bumpErr) { skipped.push(`${b.id}:bump_failed`); continue; }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: {
              id: b.id, status: 'pending', city: b.city,
              category: b.category, scheduled_date: b.scheduled_date,
              price_estimate_cents: b.price_estimate_cents,
              // Re-dispatch rounds revive offers + re-ping pocket channels
              // (push + WhatsApp + SMS) so missed offers get a second chance.
              // Only the repeat email is suppressed (reads as spam).
              quiet: true,
            },
          }),
        });
        if (resp.ok) {
          redispatched++;
          console.log(`[redispatch] round ${round + 1} for booking ${b.id}`);
        } else {
          console.warn(`[redispatch] dispatch non-2xx for ${b.id}`, resp.status, (await resp.text().catch(() => '')).slice(0, 200));
        }
      } catch (e) {
        console.warn(`[redispatch] dispatch call failed for ${b.id}`, e);
      }
    }

    return new Response(
      JSON.stringify({ candidates: candidates?.length ?? 0, redispatched, skipped }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[redispatch] unhandled', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
