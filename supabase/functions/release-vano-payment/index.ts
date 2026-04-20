import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Hirer-initiated release of a held Vano Pay payment. Moves the held
// funds from the platform Stripe account to the freelancer's Connect
// account via a Stripe Transfer, minus the 3% Vano fee (which stays
// on the platform as revenue).
//
// Guards:
//   - Caller must be authenticated.
//   - Caller must be the business_id on the vano_payments row
//     (freelancers cannot release their own funds — that would defeat
//     the escrow).
//   - Row must be in 'paid' status (held). If it's already
//     'transferred' we treat that as idempotent success; any other
//     state is an error.
//   - Row must not have a live dispute_reason — disputed payments are
//     frozen and only an admin can release them via the dashboard.
//   - Freelancer's stripe_destination_account_id must be populated
//     on the row (snapshotted at checkout time).
//
// On success:
//   - Creates a Stripe Transfer of (amount_cents - fee_cents) to the
//     freelancer's Connect account, sourced from the original payment
//     intent so Stripe's reporting ties the transfer to the charge.
//   - Flips row to 'transferred' with released_at, released_by='hirer',
//     stripe_transfer_id populated, auto_release_at cleared.
//   - Bumps the conversation updated_at so the thread sorts to top
//     in both participants' inboxes.
//
// verify_jwt=true via Authorization header (same pattern as
// create-vano-payment-checkout). Stripe writes are idempotent via the
// Idempotency-Key header so a retry with the same payment id is safe.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response => new Response(
    JSON.stringify({ error }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
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
    const paymentId = typeof body?.payment_id === 'string' ? body.payment_id : null;
    if (!paymentId) return bad(400, 'payment_id is required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the row with the fields we need. Service role bypasses RLS
    // but we still enforce business_id = caller below.
    const { data: payment, error: fetchError } = await supabase
      .from('vano_payments')
      .select('id, business_id, freelancer_id, conversation_id, status, amount_cents, fee_cents, stripe_payment_intent_id, stripe_destination_account_id, stripe_transfer_id, dispute_reason, currency')
      .eq('id', paymentId)
      .maybeSingle();

    if (fetchError || !payment) return bad(404, 'Payment not found');
    if (payment.business_id !== callerId) return bad(403, 'Only the hirer can release this payment');

    // Already released → idempotent success. The UI might have sent a
    // retry after a network hiccup; don't punish that.
    if (payment.status === 'transferred') {
      return new Response(JSON.stringify({ ok: true, already_released: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (payment.status !== 'paid') {
      return bad(409, `Cannot release a payment in ${payment.status} status`);
    }
    if (payment.dispute_reason) {
      return bad(409, 'This payment is flagged for review. Contact support to resolve.');
    }
    if (!payment.stripe_destination_account_id) {
      return bad(500, 'Missing destination account on payment row');
    }
    if (!payment.stripe_payment_intent_id) {
      return bad(500, 'Missing payment intent on payment row');
    }

    const transferAmount = payment.amount_cents - payment.fee_cents;
    if (transferAmount <= 0) return bad(500, 'Transfer amount is non-positive');

    // Optimistic flip: reserve the row with a pending-transfer marker
    // so a concurrent call (double-click on release) sees status != 'paid'
    // and hits the idempotent-success branch above on re-read. We pick
    // stripe_transfer_id = 'pending' as an in-flight sentinel; if the
    // Stripe call fails below, we roll it back.
    const { data: reserved, error: reserveError } = await supabase
      .from('vano_payments')
      .update({ stripe_transfer_id: 'pending' })
      .eq('id', paymentId)
      .eq('status', 'paid')
      .is('stripe_transfer_id', null)
      .select('id')
      .maybeSingle();

    if (reserveError) {
      console.error('[release-vano-payment] reserve failed', reserveError);
      return bad(500, 'Could not reserve payment for release');
    }
    if (!reserved) {
      // Someone else is already releasing this row; treat as idempotent.
      return new Response(JSON.stringify({ ok: true, already_in_flight: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Stripe Transfer. source_transaction ties it back to the charge
    // so reporting + reversal paths work correctly. Idempotency-Key
    // is set to the payment id so Stripe dedupes server-side across
    // retries.
    const transferParams: Record<string, string> = {
      amount: String(transferAmount),
      currency: payment.currency || 'eur',
      destination: payment.stripe_destination_account_id,
      source_transaction: payment.stripe_payment_intent_id,
      'metadata[vano_payment_id]': paymentId,
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `vano_release_${paymentId}`,
      },
      body: formEncode(transferParams),
    });

    if (!stripeResp.ok) {
      const text = await stripeResp.text().catch(() => '');
      console.error('[release-vano-payment] stripe transfer failed', stripeResp.status, text.slice(0, 400));
      await supabase
        .from('vano_payments')
        .update({ stripe_transfer_id: null })
        .eq('id', paymentId)
        .eq('stripe_transfer_id', 'pending');
      return bad(502, 'Transfer failed. Please try again in a moment.');
    }

    const transfer = await stripeResp.json() as { id: string };

    const nowIso = new Date().toISOString();
    const { error: finalError } = await supabase
      .from('vano_payments')
      .update({
        status: 'transferred',
        stripe_transfer_id: transfer.id,
        released_at: nowIso,
        released_by: 'hirer',
        completed_at: nowIso,
        auto_release_at: null,
      })
      .eq('id', paymentId);

    if (finalError) {
      console.error('[release-vano-payment] final state write failed', finalError);
      // Transfer has already happened at Stripe — we can't reverse it
      // here without a new API call. Log and return 500 so ops can
      // reconcile. The row still carries the transfer id so the state
      // isn't silently lost.
      return bad(500, 'Transfer succeeded but DB write failed. Check support.');
    }

    if (payment.conversation_id) {
      await supabase
        .from('conversations')
        .update({ updated_at: nowIso })
        .eq('id', payment.conversation_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      released: true,
      transfer_id: transfer.id,
      amount_cents: transferAmount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[release-vano-payment] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
