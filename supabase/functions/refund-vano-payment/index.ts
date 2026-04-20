import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Hirer-initiated refund of a held Vano Pay payment. Issues a Stripe
// refund on the original payment intent, returning the full amount to
// the hirer's card. Used when the work wasn't done or the hirer wants
// to back out during the 14-day hold window.
//
// Guards:
//   - Caller must be authenticated.
//   - Caller must be the business_id on the vano_payments row
//     (freelancers cannot refund a payment they're expecting — the
//     escrow protects against that).
//   - Row must be in 'paid' status (held). Already-transferred funds
//     can't be refunded through this path (Stripe rules). Already-
//     refunded rows are idempotent success.
//   - stripe_payment_intent_id must be populated (webhook writes it).
//   - Optional free-text dispute_reason (max 500 chars) — stored on
//     the row for audit and to flag it as a disputed refund vs a
//     mutual cancellation.
//
// On success:
//   - Calls Stripe POST /v1/refunds with the payment intent id and
//     an Idempotency-Key so a retry is safe.
//   - Flips row to 'refunded' with refunded_at, stripe_refund_id
//     populated, auto_release_at cleared, and (if provided)
//     dispute_reason + disputed_at stamped.
//   - Bumps the conversation updated_at so the receipt card surfaces
//     in both inboxes.
//
// Pairs with release-vano-payment/index.ts — identical auth + DB
// guard pattern; they just call different Stripe endpoints.

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
    const rawReason = typeof body?.dispute_reason === 'string' ? body.dispute_reason.trim() : '';
    const disputeReason = rawReason ? rawReason.slice(0, 500) : null;

    if (!paymentId) return bad(400, 'payment_id is required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: payment, error: fetchError } = await supabase
      .from('vano_payments')
      .select('id, business_id, conversation_id, status, amount_cents, stripe_payment_intent_id, stripe_refund_id')
      .eq('id', paymentId)
      .maybeSingle();

    if (fetchError || !payment) return bad(404, 'Payment not found');
    if (payment.business_id !== callerId) {
      return bad(403, 'Only the hirer can refund this payment');
    }

    // Already refunded → idempotent success.
    if (payment.status === 'refunded') {
      return new Response(JSON.stringify({ ok: true, already_refunded: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (payment.status !== 'paid') {
      return bad(409, `Cannot refund a payment in ${payment.status} status`);
    }
    if (!payment.stripe_payment_intent_id) {
      return bad(500, 'Missing payment intent on payment row');
    }

    // Reserve the row with a 'pending_refund' sentinel on
    // stripe_refund_id so a concurrent refund call (double-click on
    // the dispute modal) hits the idempotent branch above on re-read.
    const { data: reserved, error: reserveError } = await supabase
      .from('vano_payments')
      .update({ stripe_refund_id: 'pending' })
      .eq('id', paymentId)
      .eq('status', 'paid')
      .is('stripe_refund_id', null)
      .select('id')
      .maybeSingle();

    if (reserveError) {
      console.error('[refund-vano-payment] reserve failed', reserveError);
      return bad(500, 'Could not reserve payment for refund');
    }
    if (!reserved) {
      return new Response(JSON.stringify({ ok: true, already_in_flight: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refundParams: Record<string, string> = {
      payment_intent: payment.stripe_payment_intent_id,
      'metadata[vano_payment_id]': paymentId,
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `vano_refund_${paymentId}`,
      },
      body: formEncode(refundParams),
    });

    if (!stripeResp.ok) {
      const text = await stripeResp.text().catch(() => '');
      console.error('[refund-vano-payment] stripe refund failed', stripeResp.status, text.slice(0, 400));
      await supabase
        .from('vano_payments')
        .update({ stripe_refund_id: null })
        .eq('id', paymentId)
        .eq('stripe_refund_id', 'pending');
      return bad(502, 'Refund failed. Please try again in a moment.');
    }

    const refund = await stripeResp.json() as { id: string };

    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, string | null> = {
      status: 'refunded',
      stripe_refund_id: refund.id,
      refunded_at: nowIso,
      completed_at: nowIso,
      auto_release_at: null,
    };
    if (disputeReason) {
      updatePayload.dispute_reason = disputeReason;
      updatePayload.disputed_at = nowIso;
    }

    const { error: finalError } = await supabase
      .from('vano_payments')
      .update(updatePayload)
      .eq('id', paymentId);

    if (finalError) {
      console.error('[refund-vano-payment] final state write failed', finalError);
      return bad(500, 'Refund succeeded but DB write failed. Check support.');
    }

    if (payment.conversation_id) {
      await supabase
        .from('conversations')
        .update({ updated_at: nowIso })
        .eq('id', payment.conversation_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      refunded: true,
      refund_id: refund.id,
      amount_cents: payment.amount_cents,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[refund-vano-payment] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
