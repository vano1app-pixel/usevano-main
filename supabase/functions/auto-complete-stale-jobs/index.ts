import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Safety backstop that auto-completes any in-progress job the customer never
// confirmed. Completion is normally the customer's call (they rate + tap "mark
// complete" on the tracking page), but this sweep steps in once a job passes
// its auto_complete_at deadline so a helper isn't left unpaid by a customer who
// closed the app. Set at job start by household-arrival: timed jobs get their
// booked time + a short grace, one-off jobs get 24h. Completion goes through
// capture-household-payment's internal path (flip to completed + auto-released
// payout).
//
// Invoked by Supabase cron (suggested cadence: every 10–15 minutes). The query
// is bounded by household_bookings_auto_complete_at_idx. Per-row failures are
// logged but never abort the batch.
//
// verify_jwt = false — only the scheduler or an operator with the service key
// should hit it; an external call would just complete jobs that are already
// overdue (same outcome as waiting for the next run).

const BATCH_LIMIT = 50;

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();
    const { data: due, error } = await supabase
      .from('household_bookings')
      .select('id')
      .eq('status', 'in_progress')
      .not('auto_complete_at', 'is', null)
      .lt('auto_complete_at', nowIso)
      // Only auto-pay jobs the customer actually paid for. Unpaid stale jobs are
      // left for the unpaid-booking reminders / ops, never auto-released.
      .not('paid_at', 'is', null)
      .limit(BATCH_LIMIT) as { data: { id: string }[] | null; error: unknown };

    if (error) {
      console.error('[auto-complete-stale-jobs] query failed', error);
      return new Response(JSON.stringify({ error: 'query_failed' }), { status: 500 });
    }

    const rows = due ?? [];
    let completed = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/capture-household-payment`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-complete': '1', 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: row.id }),
        });
        if (resp.ok) { completed++; } else {
          failed++;
          console.warn('[auto-complete-stale-jobs] capture failed', row.id, resp.status, (await resp.text().catch(() => '')).slice(0, 200));
        }
      } catch (err) {
        failed++;
        console.error('[auto-complete-stale-jobs] capture threw', row.id, err);
      }
    }

    return new Response(JSON.stringify({ checked: rows.length, completed, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[auto-complete-stale-jobs] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
