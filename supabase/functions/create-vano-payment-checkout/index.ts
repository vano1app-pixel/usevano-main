import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Business-side entry point for Vano Pay. Given a conversation id and
// an amount, creates a vano_payments row and a Stripe Checkout Session
// that routes the charge to the freelancer's Connect account minus a
// 3% Vano application fee. Returns the Checkout URL; frontend redirects.
//
// Guards:
//   - Caller must be the business participant of the conversation.
//   - Freelancer must have stripe_account_id AND stripe_payouts_enabled.
//   - Amount must be >= €1.00 (Stripe minimum for EUR).
//   - Funds are captured by Stripe into the platform account, then
//     Stripe splits off the application fee and transfers the rest to
//     the freelancer's connected account. No escrow; it's a pass-through.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const VANO_FEE_BPS = 300; // 3.00% in basis points.
const MIN_AMOUNT_CENTS = 100;
const MAX_AMOUNT_CENTS = 500000; // €5,000 ceiling for MVP. Adjust as needed.
const CURRENCY = 'eur';

function bad(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Stripe Checkout Session with destination charge: the payment
    // intent is created on the platform, then Stripe transfers
    // (amount - application_fee_amount) to the connected freelancer
    // account. Standard Stripe processing fees come out of the
    // platform account.
    const checkoutParams: Record<string, string> = {
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': CURRENCY,
      'line_items[0][price_data][unit_amount]': String(amountCents),
      'line_items[0][price_data][product_data][name]':
        description ? `Vano Pay — ${description.slice(0, 80)}` : 'Vano Pay',
      'line_items[0][quantity]': '1',
      // Destination charge plumbing.
      'payment_intent_data[application_fee_amount]': String(feeCents),
      'payment_intent_data[transfer_data][destination]': freelancerProfile.stripe_account_id,
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
