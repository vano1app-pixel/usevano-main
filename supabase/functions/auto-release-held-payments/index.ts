import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Scheduled sweep that releases held Vano Pay payments whose 14-day
// hold window has elapsed without the hirer either releasing or
// flagging a dispute. This is the "hirer ghosts" protection: without
// it, a held payment sits on the platform forever if the hirer never
// logs back in, and the freelancer is effectively held hostage.
//
// Invoked by Supabase cron (pg_cron or Supabase Scheduler). Suggested
// cadence: hourly. The query is tightly bounded by
// vano_payments_auto_release_due_idx so a scan is cheap regardless of
// payments-table size. Per-row failures are logged but don't abort
// the batch — one problematic row shouldn't block every other
// freelancer's money.
//
// verify_jwt=false. Only the Supabase scheduler or an operator with
// the service role key should hit this; callable from the outside
// would just kick off due releases anyway (same outcome as waiting),
// but we still keep it off the public auth surface.

const BATCH_LIMIT = 50; // one run processes up to 50 due payments
const TRANSFER_TIMEOUT_MS = 15_000;

type PaymentRow = {
  id: string;
  conversation_id: string | null;
  amount_cents: number;
  fee_cents: number;
  currency: string | null;
  stripe_payment_intent_id: string | null;
  stripe_destination_account_id: string | null;
  freelancer_id: string | null;
};

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

serve(async (_req) => {
  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), { status: 500 });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    // Query due rows. The partial index
    // vano_payments_auto_release_due_idx covers exactly this predicate.
    const { data: due, error: queryError } = await supabase
      .from('vano_payments')
      .select('id, conversation_id, amount_cents, fee_cents, currency, stripe_payment_intent_id, stripe_destination_account_id, freelancer_id')
      .eq('status', 'paid')
      .is('dispute_reason', null)
      .is('stripe_transfer_id', null)
      .not('auto_release_at', 'is', null)
      .lt('auto_release_at', nowIso)
      .limit(BATCH_LIMIT);

    if (queryError) {
      console.error('[auto-release-held-payments] query failed', queryError);
      return new Response(JSON.stringify({ error: 'query_failed' }), { status: 500 });
    }

    const rows = (due ?? []) as PaymentRow[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ released: 0, checked: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let released = 0;
    let failed = 0;

    for (const row of rows) {
      if (!row.stripe_destination_account_id || !row.stripe_payment_intent_id) {
        console.warn('[auto-release-held-payments] skip row missing refs', { id: row.id });
        failed++;
        continue;
      }

      const transferAmount = row.amount_cents - row.fee_cents;
      if (transferAmount <= 0) {
        console.warn('[auto-release-held-payments] skip row with non-positive transfer', { id: row.id });
        failed++;
        continue;
      }
      // Fee bound check: a corrupted fee_cents (e.g. 5000 on a €100
      // payment) would silently underpay the freelancer. Reject fees
      // greater than 20% of the gross — well above any real config
      // (current fee is 3%), so this never fires in normal flow but
      // catches data corruption before money moves.
      if (row.fee_cents < 0 || row.fee_cents > Math.floor(row.amount_cents * 0.2)) {
        console.error('[auto-release-held-payments] fee out of bounds', {
          id: row.id,
          amount_cents: row.amount_cents,
          fee_cents: row.fee_cents,
        });
        failed++;
        continue;
      }
      // Re-check the freelancer's Connect account is still able to
      // receive transfers. Stripe will reject the transfer otherwise
      // and we'd roll back to null and retry every cron run forever.
      // Skipping here leaves the row in 'paid' state so the next run
      // can re-check; if ops resolves the account issue the row
      // auto-releases on the next cron. No silent money-loss path.
      if (row.freelancer_id) {
        const { data: freelancerProfile } = await supabase
          .from('student_profiles')
          .select('stripe_payouts_enabled')
          .eq('user_id', row.freelancer_id)
          .maybeSingle();
        if (!freelancerProfile?.stripe_payouts_enabled) {
          console.warn('[auto-release-held-payments] freelancer payouts disabled, deferring', {
            id: row.id,
            freelancer_id: row.freelancer_id,
          });
          failed++;
          continue;
        }
      }

      // Reserve with a pending sentinel so if this function gets
      // triggered twice concurrently (Supabase cron quirk + manual
      // invocation) the second one skips this row.
      const { data: reserved } = await supabase
        .from('vano_payments')
        .update({ stripe_transfer_id: 'pending' })
        .eq('id', row.id)
        .eq('status', 'paid')
        .is('stripe_transfer_id', null)
        .is('dispute_reason', null)
        .select('id')
        .maybeSingle();

      if (!reserved) {
        // Another invocation grabbed it, or the state changed under us.
        continue;
      }

      let transferId: string | null = null;
      try {
        const transferParams: Record<string, string> = {
          amount: String(transferAmount),
          currency: row.currency || 'eur',
          destination: row.stripe_destination_account_id,
          source_transaction: row.stripe_payment_intent_id,
          'metadata[vano_payment_id]': row.id,
          'metadata[released_by]': 'auto',
        };

        const resp = await fetchWithTimeout(
          'https://api.stripe.com/v1/transfers',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              // Same idempotency key as the hirer-release path. If a
              // hirer-release fired moments before the cron, Stripe
              // returns the existing transfer and we just stamp the
              // DB state. No double-transfer.
              'Idempotency-Key': `vano_release_${row.id}`,
            },
            body: formEncode(transferParams),
          },
          TRANSFER_TIMEOUT_MS,
        );

        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          console.error('[auto-release-held-payments] stripe transfer failed', row.id, resp.status, text.slice(0, 400));
          await supabase
            .from('vano_payments')
            .update({ stripe_transfer_id: null })
            .eq('id', row.id)
            .eq('stripe_transfer_id', 'pending');
          failed++;
          continue;
        }

        const payload = await resp.json() as { id: string };
        transferId = payload.id;
      } catch (err) {
        console.error('[auto-release-held-payments] transfer threw', row.id, err);
        await supabase
          .from('vano_payments')
          .update({ stripe_transfer_id: null })
          .eq('id', row.id)
          .eq('stripe_transfer_id', 'pending');
        failed++;
        continue;
      }

      const stampIso = new Date().toISOString();
      const { error: finalError } = await supabase
        .from('vano_payments')
        .update({
          status: 'transferred',
          stripe_transfer_id: transferId,
          released_at: stampIso,
          released_by: 'auto',
          completed_at: stampIso,
          auto_release_at: null,
        })
        .eq('id', row.id);

      if (finalError) {
        // Transfer already at Stripe; we can't easily reverse. Log so
        // ops can reconcile. The transfer_id is stored only if
        // finalError is nil — which means on failure the row still
        // carries 'pending'. Downstream: ops sees 'pending' and can
        // query Stripe for the transfer (idempotency key reveals it).
        console.error('[auto-release-held-payments] final DB write failed after transfer', row.id, finalError);
        failed++;
        continue;
      }

      if (row.conversation_id) {
        await supabase
          .from('conversations')
          .update({ updated_at: stampIso })
          .eq('id', row.conversation_id);
      }

      released++;
    }

    return new Response(JSON.stringify({
      checked: rows.length,
      released,
      failed,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[auto-release-held-payments] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
