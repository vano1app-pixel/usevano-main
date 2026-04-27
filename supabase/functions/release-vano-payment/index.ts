import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Hirer- or admin-initiated release of a held Vano Pay payment. Moves
// the held funds from the platform Stripe account to the freelancer's
// Connect account via a Stripe Transfer, minus the 3% Vano fee (which
// stays on the platform as revenue).
//
// Guards:
//   - Caller must be authenticated.
//   - Caller must be the business_id on the vano_payments row OR hold
//     the 'admin' role in user_roles (admins can release disputed
//     payments as part of resolution). Freelancers cannot release
//     their own funds — that would defeat the escrow.
//   - Row must be in 'paid' status (held). If it's already
//     'transferred' we treat that as idempotent success; any other
//     state is an error.
//   - Row must not have a live dispute_reason unless the caller is an
//     admin — hirers see the payment as frozen once they've flagged it
//     so they can't work around their own dispute.
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
    // but we still enforce business_id = caller (or admin) below.
    const { data: payment, error: fetchError } = await supabase
      .from('vano_payments')
      .select('id, business_id, freelancer_id, conversation_id, status, amount_cents, fee_cents, stripe_payment_intent_id, stripe_destination_account_id, stripe_transfer_id, dispute_reason, currency')
      .eq('id', paymentId)
      .maybeSingle();

    if (fetchError || !payment) return bad(404, 'Payment not found');

    // Admin override — a flagged dispute can only be released by an
    // admin as part of resolution. Role lookup happens AFTER the row
    // fetch so we never leak row existence to unauthed callers.
    const isOwner = payment.business_id === callerId;
    let isAdmin = false;
    if (!isOwner) {
      const { data: roleCheck } = await supabase.rpc('has_role', {
        _user_id: callerId,
        _role: 'admin',
      });
      isAdmin = !!roleCheck;
      if (!isAdmin) return bad(403, 'Only the hirer or an admin can release this payment');
    }

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
    if (payment.dispute_reason && !isAdmin) {
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
    // Fee bound check: catches a corrupted fee_cents (e.g. via a bad
    // migration or direct DB write) that would silently underpay the
    // freelancer. 20% is an absolute ceiling — well above the real
    // config (3%) so this never trips in normal flow. Runs after the
    // non-positive check so we only surface this error when the
    // transfer would otherwise have proceeded with bad numbers.
    if (payment.fee_cents < 0 || payment.fee_cents > Math.floor(payment.amount_cents * 0.2)) {
      console.error('[release-vano-payment] fee out of bounds', {
        id: paymentId,
        amount_cents: payment.amount_cents,
        fee_cents: payment.fee_cents,
      });
      return bad(500, 'Fee mismatch on payment row — contact support');
    }

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
    // Filter on the 'pending' sentinel we set during reserve, NOT just
    // the row id. If something concurrent (admin refund / dispute /
    // chargeback webhook) flipped the row between our reserve and
    // here, the row's stripe_transfer_id is no longer 'pending' and
    // the UPDATE matches zero rows — we surface that as a hard error
    // so ops can reconcile, instead of silently overwriting the newer
    // terminal state with 'transferred'. The Stripe transfer DID
    // succeed (money moved), so this is a real inconsistency that
    // needs a manual reverse.
    const { data: stamped, error: finalError } = await supabase
      .from('vano_payments')
      .update({
        status: 'transferred',
        stripe_transfer_id: transfer.id,
        released_at: nowIso,
        released_by: isAdmin ? 'admin' : 'hirer',
        completed_at: nowIso,
        auto_release_at: null,
      })
      .eq('id', paymentId)
      .eq('stripe_transfer_id', 'pending')
      .select('id')
      .maybeSingle();

    if (finalError) {
      console.error('[release-vano-payment] final state write failed', finalError);
      // Transfer has already happened at Stripe — we can't reverse it
      // here without a new API call. Log and return 500 so ops can
      // reconcile. The row still carries the transfer id so the state
      // isn't silently lost.
      return bad(500, 'Transfer succeeded but DB write failed. Check support.');
    }
    if (!stamped) {
      console.error('[release-vano-payment] race detected: row no longer in pending state after transfer succeeded', {
        paymentId,
        stripeTransferId: transfer.id,
      });
      return bad(409, 'Transfer succeeded but the payment state changed concurrently. Contact support to reconcile.');
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
