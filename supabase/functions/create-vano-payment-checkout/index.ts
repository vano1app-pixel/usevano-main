import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import {
  VANO_PAY_CURRENCY,
  VANO_PAY_FEE_BPS,
  VANO_PAY_MAX_CENTS,
  VANO_PAY_MIN_CENTS,
} from "../_shared/vanoPayConfig.ts";

// Business-side entry point for Vano Pay. Given a conversation id and
// an amount, creates a vano_payments row and a Stripe Checkout Session
// that charges the hirer on the platform Stripe account. Funds are
// HELD on the platform until either the hirer releases them (via the
// release-vano-payment edge function) or the auto-release cron fires
// 14 days after the hold started.
//
// Guards:
//   - Caller must be the business participant of the conversation.
//   - Freelancer must have stripe_account_id AND stripe_payouts_enabled
//     (we snapshot the account id onto vano_payments.stripe_destination_account_id
//     so the release transfer still works if the freelancer later
//     disconnects their Connect account).
//   - Amount must be >= €1.00 (Stripe minimum for EUR).
//   - Funds are charged to the platform account (no destination
//     transfer at checkout). release-vano-payment handles the actual
//     transfer to the freelancer when the hirer releases or the cron
//     auto-releases. stripe_transfer_id on the row gets populated then.

// Fee/bounds live in _shared/vanoPayConfig.ts so the public
// get-vano-pay-config endpoint reads the same values.
const VANO_FEE_BPS = VANO_PAY_FEE_BPS;
const MIN_AMOUNT_CENTS = VANO_PAY_MIN_CENTS;
const MAX_AMOUNT_CENTS = VANO_PAY_MAX_CENTS;
const CURRENCY = VANO_PAY_CURRENCY;

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
    if (!authHeader?.startsWith('Bearer ')) {
      return bad(401, 'Unauthorized');
    }

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
    if (claimsError || !claimsData?.claims) {
      return bad(401, 'Unauthorized');
    }
    const callerId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : null;
    const amountCents = Number.isInteger(body?.amount_cents) ? body.amount_cents as number : null;
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const hireAgreementId = typeof body?.hire_agreement_id === 'string' ? body.hire_agreement_id : null;
    // Optional — attached when the checkout is for a digital-sales
    // bonus payout. Stamped onto vano_payments so the DB trigger that
    // syncs sales_deals.bonus_status can find the originating deal
    // when the webhook flips the payment to `transferred`. Loose
    // reference on both sides (no FK) so a deleted deal doesn't
    // cascade-block a legitimate payment that's already in flight.
    const salesDealId = typeof body?.sales_deal_id === 'string' ? body.sales_deal_id : null;

    if (!conversationId) return bad(400, 'conversation_id is required');
    if (!amountCents || amountCents < MIN_AMOUNT_CENTS) {
      return bad(400, 'Amount must be at least €1.00');
    }
    if (amountCents > MAX_AMOUNT_CENTS) {
      return bad(400, 'Amount exceeds the €5,000 ceiling. Split into multiple payments.');
    }
    if (description.length > 200) {
      return bad(400, 'Description too long (max 200 chars)');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve the conversation: who are the two participants?
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, participant_1, participant_2')
      .eq('id', conversationId)
      .maybeSingle();

    if (convError || !conversation) {
      return bad(404, 'Conversation not found');
    }

    const participants = [conversation.participant_1, conversation.participant_2];
    if (!participants.includes(callerId)) {
      return bad(403, 'You are not a participant of this conversation');
    }
    const otherId = participants.find((p) => p !== callerId);
    if (!otherId) return bad(400, 'Could not resolve the other participant');

    // Caller must be business, other side must be the freelancer.
    // Fetch both profile rows in one round-trip to verify roles.
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, user_type')
      .in('user_id', [callerId, otherId]);

    const callerType = profiles?.find((p) => p.user_id === callerId)?.user_type;
    const otherType = profiles?.find((p) => p.user_id === otherId)?.user_type;

    if (callerType !== 'business') {
      return bad(403, 'Only business accounts can initiate Vano Pay');
    }
    if (otherType !== 'student') {
      return bad(400, 'The other participant is not a freelancer');
    }

    // Freelancer must have Connect set up and ready.
    const { data: freelancerProfile } = await supabase
      .from('student_profiles')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', otherId)
      .maybeSingle();

    if (!freelancerProfile?.stripe_account_id || !freelancerProfile.stripe_payouts_enabled) {
      return bad(
        409,
        'This freelancer has not enabled Vano Pay yet. Ask them to set it up in their profile.',
      );
    }

    const feeCents = Math.max(1, Math.round((amountCents * VANO_FEE_BPS) / 10000));

    // Insert the pending payment row first so the session id has
    // somewhere to live and the webhook can find it on arrival.
    const { data: inserted, error: insertError } = await supabase
      .from('vano_payments')
      .insert({
        business_id: callerId,
        freelancer_id: otherId,
        conversation_id: conversationId,
        hire_agreement_id: hireAgreementId,
        // Present only for digital-sales bonus payouts. A DB trigger
        // on vano_payments watches UPDATE events and flips the
        // matching sales_deals.bonus_status to 'paid' once this
        // payment reaches the `transferred` state.
        sales_deal_id: salesDealId,
        description: description || null,
        amount_cents: amountCents,
        fee_cents: feeCents,
        currency: CURRENCY,
        stripe_destination_account_id: freelancerProfile.stripe_account_id,
        status: 'awaiting_payment',
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      console.error('[create-vano-payment-checkout] insert failed', insertError);
      return bad(500, 'Could not create payment. Please try again.');
    }

    const paymentId: string = inserted.id;

    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    // Stripe Checkout Session, charge-only (NO destination transfer).
    // The charge lands on the platform Stripe account and sits there
    // until release-vano-payment fires the transfer to the freelancer
    // (either hirer-triggered via "Release payment" or auto-triggered
    // after 14 days by the auto-release cron).
    //
    // payment_method_types is intentionally omitted so Stripe auto-
    // enables every supported method for the currency/geo — crucially
    // Apple Pay + Google Pay on mobile, which make the "tap to pay"
    // feel the funnel is built around. Locking to card-only would
    // force every customer through manual card entry.
    //
    // metadata[vano_payment_id] is what the webhook keys off to find
    // the row and flip it from awaiting_payment → paid (held). The
    // amount we charge is the full amountCents — fee and transfer
    // split happen at release time, not at checkout.
    const checkoutParams: Record<string, string> = {
      mode: 'payment',
      'line_items[0][price_data][currency]': CURRENCY,
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]':
        description ? `Vano Pay — ${description.slice(0, 80)}` : 'Vano Pay',
      'line_items[0][quantity]': '1',
      success_url: `${origin}/messages?payment=${paymentId}&status=success`,
      cancel_url: `${origin}/messages?payment=${paymentId}&status=cancel`,
      'metadata[vano_payment_id]': paymentId,
      'metadata[conversation_id]': conversationId,
      client_reference_id: paymentId,
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(checkoutParams),
    });

    if (!stripeResp.ok) {
      const text = await stripeResp.text();
      console.error('[create-vano-payment-checkout] stripe error', stripeResp.status, text);
      await supabase
        .from('vano_payments')
        .update({ status: 'failed', error_message: 'stripe_checkout_failed' })
        .eq('id', paymentId);
      return bad(502, 'Payment provider error. Please try again.');
    }

    const session = await stripeResp.json() as { id: string; url: string };

    await supabase
      .from('vano_payments')
      .update({ stripe_session_id: session.id })
      .eq('id', paymentId);

    return new Response(
      JSON.stringify({
        url: session.url,
        id: paymentId,
        amount_cents: amountCents,
        fee_cents: feeCents,
        freelancer_receives_cents: amountCents - feeCents,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-vano-payment-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
