import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron sweep that releases household helper payouts that were held as
// 'pending' because the helper hadn't finished Stripe Connect onboarding
// when the job completed. Once they onboard (stripe_payouts_enabled flips
// via the account.updated webhook), this fires the Stripe Transfer that
// capture-household-payment couldn't, and flips the payout to
// 'transferred'.
//
// Mirrors release-vano-payment's Transfer call and
// capture-household-payment's source_transaction rule (pi_ → tie to the
// charge; cs_/missing → transfer from platform balance). Each row is
// best-effort: a failure is logged and the row stays 'pending' for the
// next sweep. Idempotency-Key + the per-payout id mean a retry never
// double-pays.
//
// verify_jwt = false — called by the scheduler / internally with the
// service key (suggested cadence: */15 * * * *). Same no-auth pattern as
// remind-confirm-completion.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

serve(async (_req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Reconciliation backfill ──────────────────────────────────────────
    // Defence-in-depth for capture-household-payment: if a job is 'completed'
    // and paid but somehow has NO payout row (a historical row, or the rare
    // window where the status flip errored after the payout insert), create
    // the missing payout here so the helper is never silently unpaid. Bounded
    // to recent completions so the scan stays cheap.
    let backfilled = 0;
    try {
      const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: doneBookings } = await supabase
        .from('household_bookings')
        .select('id, student_id, price_estimate_cents')
        .eq('status', 'completed')
        .not('paid_at', 'is', null)
        .not('student_id', 'is', null)
        .gt('price_estimate_cents', 0)
        // Never back-fill a payout for a disputed/refunded booking.
        .is('disputed_at', null)
        .is('refunded_at', null)
        .gte('created_at', sinceIso)
        .limit(200) as { data: Array<{ id: string; student_id: string; price_estimate_cents: number }> | null };
      const doneIds = (doneBookings ?? []).map((b) => b.id);
      if (doneIds.length) {
        const { data: existing } = await supabase
          .from('household_payouts').select('booking_id').in('booking_id', doneIds) as { data: Array<{ booking_id: string }> | null };
        const havePayout = new Set((existing ?? []).map((r) => r.booking_id));
        const PLATFORM_FEE_BPS = 1500;
        for (const b of doneBookings ?? []) {
          if (havePayout.has(b.id)) continue;
          const studentCents = Math.floor((b.price_estimate_cents ?? 0) * (10000 - PLATFORM_FEE_BPS) / 10000);
          if (studentCents <= 0) continue;
          const { error: insErr } = await supabase
            .from('household_payouts')
            .insert({ booking_id: b.id, student_id: b.student_id, amount_cents: studentCents, status: 'pending' });
          // 23505 = a payout appeared concurrently; anything else is logged only.
          if (!insErr) backfilled++;
          else if ((insErr as { code?: string }).code !== '23505') console.error('[release] backfill insert failed', b.id, insErr);
        }
      }
    } catch (reconErr) {
      console.error('[release-household-payouts] reconciliation backfill errored', reconErr);
    }

    // Retry cap: a transfer that keeps failing for a non-onboarding reason
    // (unsettled balance, destination restriction) must not loop forever — after
    // MAX_TRANSFER_ATTEMPTS we mark it 'failed', page the owner once, and stop.
    const MAX_TRANSFER_ATTEMPTS = 6;
    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const alertOwner = async (payoutId: string, studentId: string, amountCents: number, stripeErr: string) => {
      const msg = `Payout ${payoutId.slice(0, 8)} for helper ${studentId.slice(0, 8)} (€${(amountCents / 100).toFixed(2)}) has failed ${MAX_TRANSFER_ATTEMPTS}× and is now marked stuck. Stripe: ${stripeErr.slice(0, 200)}`;
      // WhatsApp page (best-effort) + email fallback.
      void fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `🚨 *Payout stuck* — ${msg}`, subject: `🚨 Helper payout stuck (${payoutId.slice(0, 8)})` }),
      }).catch(() => {});
      if (resendKey && adminEmail) {
        void fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: resendFrom, to: [adminEmail], subject: `🚨 Helper payout stuck (${payoutId.slice(0, 8)})`, text: msg }),
        }).catch(() => {});
      }
    };

    // Held payouts (auto-completed jobs in their cooling-off window) wait until
    // hold_until elapses, so a dispute can still cancel + refund cleanly first.
    const nowIso = new Date().toISOString();
    const { data: pending, error } = await supabase
      .from('household_payouts')
      .select('id, booking_id, student_id, amount_cents, transfer_attempts')
      .eq('status', 'pending')
      .or(`hold_until.is.null,hold_until.lt.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[release-household-payouts] fetch failed', error);
      return new Response(JSON.stringify({ error: 'fetch_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let released = 0, skipped = 0, failed = 0, stuck = 0;

    for (const p of pending ?? []) {
      const payoutId = p.id as string;
      const studentId = p.student_id as string;
      const amountCents = p.amount_cents as number;

      try {
        if (!amountCents || amountCents <= 0) { skipped++; continue; }

        // Helper must be onboarded with a Connect account.
        const { data: helper } = await supabase
          .from('household_helpers')
          .select('stripe_account_id, stripe_payouts_enabled')
          .eq('user_id', studentId)
          .maybeSingle();
        const destination = helper?.stripe_account_id as string | null | undefined;
        if (!destination) { skipped++; continue; }

        // Confirm the account is payout-ready. We check Stripe directly (not
        // just the cached flag) so earnings release even if the account.updated
        // webhook isn't wired up — and backfill the flag so the helper's payout
        // card reflects reality.
        let ready = !!helper?.stripe_payouts_enabled;
        if (!ready) {
          const acctResp = await fetch(`https://api.stripe.com/v1/accounts/${destination}`, {
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
          });
          if (acctResp.ok) {
            const acct = await acctResp.json() as { payouts_enabled?: boolean };
            ready = !!acct.payouts_enabled;
            if (ready) {
              await supabase.from('household_helpers').update({ stripe_payouts_enabled: true }).eq('user_id', studentId);
            }
          }
        }
        if (!ready) { skipped++; continue; }

        // source_transaction only valid for a real PaymentIntent.
        const { data: booking } = await supabase
          .from('household_bookings')
          .select('stripe_payment_intent_id')
          .eq('id', p.booking_id as string)
          .maybeSingle();
        const intentId = booking?.stripe_payment_intent_id as string | null | undefined;

        const transferParams: Record<string, string> = {
          amount: String(amountCents),
          currency: 'eur',
          destination,
          'metadata[vano_household_payout_id]': payoutId,
        };
        if (intentId && intentId.startsWith('pi_')) transferParams.source_transaction = intentId;

        const resp = await fetch('https://api.stripe.com/v1/transfers', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `vano_household_payout_${payoutId}`,
          },
          body: formEncode(transferParams),
        });

        if (resp.ok) {
          const transfer = await resp.json() as { id: string };
          await supabase
            .from('household_payouts')
            .update({ status: 'transferred', stripe_transfer_id: transfer.id, released_at: new Date().toISOString() })
            .eq('id', payoutId);
          released++;
        } else {
          const text = await resp.text().catch(() => '');
          console.error('[release-household-payouts] transfer failed', payoutId, resp.status, text.slice(0, 300));
          // Count the attempt; cap retries so a permanently-failing transfer
          // can't loop invisibly forever. On the final strike, mark it 'failed'
          // and page the owner exactly once.
          const attempts = (Number(p.transfer_attempts) || 0) + 1;
          if (attempts >= MAX_TRANSFER_ATTEMPTS) {
            await supabase.from('household_payouts')
              .update({ status: 'failed', transfer_attempts: attempts, last_transfer_error: text.slice(0, 500), stuck_alerted_at: new Date().toISOString() })
              .eq('id', payoutId);
            await alertOwner(payoutId, studentId, amountCents, text);
            stuck++;
          } else {
            await supabase.from('household_payouts')
              .update({ transfer_attempts: attempts, last_transfer_error: text.slice(0, 500) })
              .eq('id', payoutId);
            failed++;
          }
        }
      } catch (rowErr) {
        console.error('[release-household-payouts] row errored', payoutId, rowErr);
        failed++;
      }
    }

    return new Response(JSON.stringify({ released, skipped, failed, stuck, backfilled }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[release-household-payouts] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
