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

    const { data: pending, error } = await supabase
      .from('household_payouts')
      .select('id, booking_id, student_id, amount_cents')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('[release-household-payouts] fetch failed', error);
      return new Response(JSON.stringify({ error: 'fetch_failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let released = 0, skipped = 0, failed = 0;

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
        if (!helper?.stripe_payouts_enabled || !destination) { skipped++; continue; }

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
          failed++;
        }
      } catch (rowErr) {
        console.error('[release-household-payouts] row errored', payoutId, rowErr);
        failed++;
      }
    }

    return new Response(JSON.stringify({ released, skipped, failed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[release-household-payouts] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
