import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Scheduled sweep that auto-completes timed jobs (cleaning, garden, moving —
// the ones with a booked duration) whose job_ends_at has passed. Completion
// goes through capture-household-payment's internal path, which flips the
// booking to completed and records the now auto-released payout. This is the
// reliable backstop: the helper/customer screens also fire completion when
// their countdown hits zero, but the sweep guarantees it even if no device is
// open.
//
// Invoked by Supabase cron (suggested cadence: every 1–5 minutes). The query
// is bounded by household_bookings_job_ends_at_idx. Per-row failures are
// logged but never abort the batch.
//
// verify_jwt = false — only the scheduler or an operator with the service key
// should hit it; an external call would just complete jobs that are already
// due (same outcome as waiting for the next run).

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
      .not('job_ends_at', 'is', null)
      .lt('job_ends_at', nowIso)
      .limit(BATCH_LIMIT) as { data: { id: string }[] | null; error: unknown };

    if (error) {
      console.error('[auto-complete-timed-jobs] query failed', error);
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
          console.warn('[auto-complete-timed-jobs] capture failed', row.id, resp.status, (await resp.text().catch(() => '')).slice(0, 200));
        }
      } catch (err) {
        failed++;
        console.error('[auto-complete-timed-jobs] capture threw', row.id, err);
      }
    }

    return new Response(JSON.stringify({ checked: rows.length, completed, failed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[auto-complete-timed-jobs] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
