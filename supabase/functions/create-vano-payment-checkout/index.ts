import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import {
  VANO_PAY_CURRENCY,
  VANO_PAY_LEGACY_FEE_BPS,
  VANO_PAY_MAX_CENTS,
  VANO_PAY_MIN_CENTS,
  computeVanoPaySplit,
} from "../_shared/vanoPayConfig.ts";

// Business-side entry point for Vano Pay. Given a conversation id and
// an AGREED PRICE (what the freelancer quoted in chat), creates a
// vano_payments row and a Stripe Checkout Session that charges the
// hirer the gross-up (agreed price + 4% hirer fee) on the platform
// Stripe account. Funds are HELD on the platform until either the
// hirer releases them (via the release-vano-payment edge function) or
// the auto-release cron fires 14 days after the hold started.
//
// Fee model is split 4% / 4% (see _shared/vanoPayConfig.ts):
//   - Hirer charge   = agreed + 4% (this is what Stripe collects).
//   - Freelancer net = agreed − 4% (released at hold-end).
//   - Vano take      = 8% of agreed (= amount_cents − freelancer_net).
//
// Guards:
//   - Caller must be the business participant of the conversation.
//   - Freelancer must have stripe_account_id AND stripe_payouts_enabled
//     (we snapshot the account id onto vano_payments.stripe_destination_account_id
//     so the release transfer still works if the freelancer later
//     disconnects their Connect account).
//   - Agreed price must be >= €1.00 (mirrors Stripe EUR minimum).
//   - Funds are charged to the platform account (no destination
//     transfer at checkout). release-vano-payment handles the actual
//     transfer to the freelancer when the hirer releases or the cron
//     auto-releases. stripe_transfer_id on the row gets populated then.
//
// Wire compatibility: the request body now prefers
// `agreed_price_cents` but accepts the legacy `amount_cents` as an
// alias so a stale client still works while the new client is
// deploying. Both are interpreted as the AGREED price (pre-fee).

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
    // The AGREED price (what the freelancer quoted in chat). The
    // hirer's actual charge is grossed up by 4% on top of this — see
    // computeVanoPaySplit. We accept both `agreed_price_cents` (new
    // canonical name) and `amount_cents` (legacy alias) so a stale
    // client during the rollout window still posts a valid payload.
    const rawAgreedPriceCents = Number.isInteger(body?.agreed_price_cents)
      ? body.agreed_price_cents as number
      : Number.isInteger(body?.amount_cents)
        ? body.amount_cents as number
        : null;
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const hireAgreementId = typeof body?.hire_agreement_id === 'string' ? body.hire_agreement_id : null;
    // Optional hirer-supplied delivery deadline. Drives the
    // auto-release timer (see computeAutoReleaseMs in
    // _shared/vanoPayConfig.ts and the stripe-webhook handler that
    // stamps auto_release_at when the row enters 'paid' state). Null
    // → keep the legacy 14-day flat hold. We accept ISO 8601 strings
    // and validate the parsed value sits within a sensible window so
    // a typo or junk payload can't end up as Stripe metadata.
    const rawDeadlineAt = typeof body?.deadline_at === 'string' ? body.deadline_at : null;
    let deadlineAtIso: string | null = null;
    if (rawDeadlineAt) {
      const ms = Date.parse(rawDeadlineAt);
      if (!Number.isFinite(ms)) {
        return bad(400, 'deadline_at is not a valid date');
      }
      const nowMs = Date.now();
      // Reject deadlines in the past — there's no useful release
      // semantics ("auto-release fires three days after a date that's
      // already gone" is just "auto-release ASAP", which the hirer
      // gets for free by tapping Release manually).
      if (ms < nowMs - 60_000) {
        return bad(400, 'deadline_at must be in the future');
      }
      // Reject deadlines more than 90 days out so a stray date input
      // can't park escrow funds for half a year. The 30-day ceiling
      // inside computeAutoReleaseMs already caps the actual release
      // window; this stops the deadline from being even more
      // misleading on the receipt card.
      if (ms > nowMs + 90 * 24 * 60 * 60 * 1000) {
        return bad(400, 'deadline_at cannot be more than 90 days in the future');
      }
      deadlineAtIso = new Date(ms).toISOString();
    }
    // Optional — attached when the checkout is for a digital-sales
    // bonus payout. Stamped onto vano_payments so the DB trigger that
    // syncs sales_deals.bonus_status can find the originating deal
    // when the webhook flips the payment to `transferred`. Loose
    // reference on both sides (no FK) so a deleted deal doesn't
    // cascade-block a legitimate payment that's already in flight.
    const salesDealId = typeof body?.sales_deal_id === 'string' ? body.sales_deal_id : null;
    // Target-based milestone payment marker. When true, the checkout
    // is paying out a "every X deals = €Y" milestone for the given
    // conversation rather than a per-deal bonus or a regular Vano Pay
    // payment. Validated below: the conversation must have a target
    // configured AND a pending milestone, and the agreed price must
    // match the configured bonus exactly. Stamps
    // is_sales_milestone_payment on the row so the
    // handle_milestone_payout DB trigger can advance the cycle when
    // the transfer settles.
    const fromMilestone = body?.from_milestone === true;

    if (!conversationId) return bad(400, 'conversation_id is required');
    if (!rawAgreedPriceCents || rawAgreedPriceCents < MIN_AMOUNT_CENTS) {
      return bad(400, 'Agreed price must be at least €1.00');
    }
    if (rawAgreedPriceCents > MAX_AMOUNT_CENTS) {
      return bad(400, 'Agreed price exceeds the €5,000 ceiling. Split into multiple payments.');
    }
    if (description.length > 200) {
      return bad(400, 'Description too long (max 200 chars)');
    }
    const agreedPriceCents = rawAgreedPriceCents;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolve the conversation: who are the two participants? Pull
    // the target columns too so milestone payments can validate
    // against them without a second round-trip. The columns are
    // nullable for non-engagement conversations, which is fine.
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, participant_1, participant_2, sales_target_count, sales_target_bonus_cents, sales_target_milestone_pending')
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

    // Three fee paths, branched on the kind of payment:
    //
    //   - Target-based milestone (from_milestone=true): pays the
    //     conversation's configured bonus_cents. Validates the
    //     conversation actually has a pending milestone so we can't
    //     accidentally drain a bonus that hasn't been earned. Uses
    //     legacy 3% single-side fee like the per-deal sales path —
    //     a milestone is just a batched-up sales bonus.
    //
    //   - Per-deal sales bonus (sales_deal_id present): legacy single
    //     -side 3% fee. The bonus_amount_cents the BusinessDealsPanel
    //     sends is already the agreed gross to the rep.
    //
    //   - Regular Vano Pay (neither marker set): split 4% / 4% on the
    //     AGREED price. Server grosses up by 4% so the hirer pays
    //     agreed + 4%; the rep receives agreed − 4%; Vano keeps 8%
    //     total. This is the model surfaced in VanoPayModal.
    //
    // All three branches preserve the row invariant
    //   amount_cents − fee_cents = freelancer_payout
    // so release-vano-payment, auto-release-held-payments, the spend
    // / earnings panels, and the in-thread receipt copy keep working
    // unchanged regardless of which model produced the row.
    let amountCents: number;
    let feeCents: number;
    if (fromMilestone) {
      // Refuse if the conversation has no target configured or no
      // pending milestone — the user can't pay a milestone that
      // hasn't fired yet, and they can't pay a stale one twice.
      const targetCount = (conversation as { sales_target_count?: number | null }).sales_target_count;
      const targetBonus = (conversation as { sales_target_bonus_cents?: number | null }).sales_target_bonus_cents;
      const pending = (conversation as { sales_target_milestone_pending?: boolean | null }).sales_target_milestone_pending;
      if (!targetCount || !targetBonus) {
        return bad(409, 'No commission target set on this conversation');
      }
      if (!pending) {
        return bad(409, 'No milestone is currently due');
      }
      // The agreed price the modal sends MUST match the configured
      // bonus — protects against tampering or a stale client showing
      // an old bonus number.
      if (agreedPriceCents !== targetBonus) {
        return bad(400, 'Milestone amount does not match the configured bonus');
      }
      amountCents = agreedPriceCents;
      feeCents = Math.max(1, Math.round((amountCents * VANO_PAY_LEGACY_FEE_BPS) / 10000));
    } else if (salesDealId) {
      amountCents = agreedPriceCents;
      feeCents = Math.max(1, Math.round((amountCents * VANO_PAY_LEGACY_FEE_BPS) / 10000));
    } else {
      const split = computeVanoPaySplit(agreedPriceCents);
      amountCents = split.amountCents;
      feeCents = split.feeCents;
    }

    // Insert the pending payment row first so the session id has
    // somewhere to live and the webhook can find it on arrival.
    // Build the row conditionally so a production DB that hasn't yet
    // applied migration 20260421140000 (which adds sales_deal_id)
    // still accepts inserts from ordinary-pay flows — the field is
    // only spread in when the caller actually supplied a value, so
    // 99% of Vano Pay traffic (non-bonus) doesn't care whether the
    // column exists yet.
    const paymentRow: Record<string, unknown> = {
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
    };
    if (deadlineAtIso) {
      // Same conditional-spread pattern as sales_deal_id below: only
      // include the field when the caller actually supplied a value
      // so a production DB that hasn't yet applied the deadline
      // migration still accepts inserts from no-deadline flows.
      paymentRow.deadline_at = deadlineAtIso;
    }
    if (salesDealId) {
      // Present only for digital-sales bonus payouts. A DB trigger
      // on vano_payments watches UPDATE events and flips the
      // matching sales_deals.bonus_status to 'paid' once this
      // payment reaches the `transferred` state.
      paymentRow.sales_deal_id = salesDealId;
    }
    if (fromMilestone) {
      // Marks the row as a target-based milestone payout so the
      // handle_milestone_payout DB trigger advances the conversation
      // cycle (paid_count += target_count, pending = false) when the
      // transfer settles.
      paymentRow.is_sales_milestone_payment = true;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('vano_payments')
      .insert(paymentRow)
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
        // Full breakdown so a caller can confirm the split client-side
        // for analytics / receipts. amount_cents is the gross Stripe
        // charge (= agreed + hirer fee).
        agreed_price_cents: split.agreedCents,
        hirer_fee_cents: split.hirerFeeCents,
        freelancer_fee_cents: split.freelancerFeeCents,
        amount_cents: amountCents,
        fee_cents: feeCents,
        freelancer_receives_cents: split.freelancerCents,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-vano-payment-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
