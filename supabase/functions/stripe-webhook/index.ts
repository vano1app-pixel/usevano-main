import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeAutoReleaseMs } from "../_shared/vanoPayConfig.ts";
import { releaseBookingMoney } from "../_shared/bookingMoney.ts";

// Stripe webhook endpoint. verify_jwt is disabled for this function
// (Stripe can't send JWTs); authenticity is proven by verifying the
// Stripe-Signature header against STRIPE_WEBHOOK_SECRET using HMAC-SHA256.
//
// Dispatches four event types:
//   1. checkout.session.completed with metadata.ai_find_request_id →
//      marks ai_find_requests as paid and kicks off AI scouting.
//   2. checkout.session.completed with metadata.vano_payment_id →
//      marks vano_payments as PAID (held on the platform). Funds do
//      not move to the freelancer here — release-vano-payment (or
//      the auto-release cron) handles that when the hirer releases
//      or the 14-day window expires.
//   3. account.updated → flips student_profiles.stripe_payouts_enabled
//      when the freelancer's Connect Express account is ready to
//      receive transfers.
//   4. charge.refunded → flips vano_payments to 'refunded' when a
//      refund lands from any source (our refund-vano-payment
//      function, ops refunding via Stripe dashboard, or a
//      cardholder chargeback). Keeps the UI honest regardless of
//      how the refund was initiated.
//
// All handlers are idempotent on replay.

// 5 minutes — the Stripe SDK default. The previous 10-minute window
// was loosened to ride out NTP jitter on the Supabase edge region,
// but that doubles the replay surface for any attacker who captures
// a signature. 5 min is the universally-recommended trade-off; if
// NTP jitter actually drops legitimate webhooks again we'll see them
// retry within Stripe's 3-day window and can re-tune then.
const TOLERANCE_SECONDS = 300;
// Auto-release timing now lives in computeAutoReleaseMs (see
// _shared/vanoPayConfig.ts). It picks between the legacy 14-day flat
// hold and a deadline-aligned hold (deadline + 72h grace, clamped to
// a 48h floor / 30-day ceiling) based on whether the hirer set a
// deadline at checkout.

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts: Record<string, string[]> = {};
  for (const piece of signatureHeader.split(',')) {
    const [k, v] = piece.split('=');
    if (!k || !v) continue;
    (parts[k] ||= []).push(v);
  }
  const timestamp = parts.t?.[0];
  const candidateSigs = parts.v1 ?? [];
  if (!timestamp || candidateSigs.length === 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = hex(mac);

  return candidateSigs.some((s) => constantTimeEqual(s, expected));
}

type SupabaseClient = ReturnType<typeof createClient>;

// --- Handler: AI Find checkout completed ----------------------------------
async function handleAiFindCheckoutCompleted(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  session: StripeCheckoutSession,
  requestId: string,
): Promise<Response> {
  // Stamp stripe_session_id in the update instead of filtering on it.
  // The edge-function path (create-ai-find-checkout) pre-populates
  // stripe_session_id when the row is inserted; the Payment Link path
  // (client-side insert) can't — Stripe issues the session id only
  // after the customer hits the link. Filtering on session id would
  // reject every Payment Link payment. status='awaiting_payment' is
  // sufficient for idempotency: a replayed webhook won't match once
  // the row is already flipped to 'paid'.
  const { data: flipped, error: flipError } = await supabase
    .from('ai_find_requests')
    .update({
      status: 'paid',
      stripe_session_id: session.id ?? null,
      stripe_payment_status: session.payment_status ?? 'paid',
      stripe_payment_intent_id: session.payment_intent ?? null,
      paid_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'awaiting_payment')
    .select('id')
    .maybeSingle();

  if (flipError) {
    console.error('[stripe-webhook] ai_find flip failed', flipError);
    return new Response('DB error', { status: 500 });
  }
  if (!flipped) {
    return new Response(JSON.stringify({ received: true, replay: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fire ai-find-freelancer in the background. If that fetch can't
  // even reach the function (DNS fail, connection refused, function
  // not deployed) the row would otherwise stay stuck at 'paid' with
  // no recovery path. Flip it to failed inline so the results page
  // stops polling.
  const triggerUrl = `${supabaseUrl}/functions/v1/ai-find-freelancer`;
  const triggerPromise = (async () => {
    try {
      const resp = await fetch(triggerUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ request_id: requestId }),
      });
      if (!resp.ok) {
        console.error('[stripe-webhook] ai-find trigger non-2xx', resp.status);
        await markStuckAiFindRequestFailed(
          supabase,
          requestId,
          `ai_find_trigger_http_${resp.status}`,
        );
      }
    } catch (err) {
      console.error('[stripe-webhook] ai-find trigger threw', err);
      await markStuckAiFindRequestFailed(
        supabase,
        requestId,
        'ai_find_trigger_unreachable',
      );
    }
  })();

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(triggerPromise);

  return new Response(JSON.stringify({ received: true, triggered: 'ai_find' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Recovery path for the rare case where ai-find-freelancer can't be
// reached at all. Flips the row to failed so the hirer never sees a
// stranded "paid but nothing happening" state. Idempotent on row
// status so a Stripe webhook retry that lands after we've already
// handled the row is a no-op.
async function markStuckAiFindRequestFailed(
  supabase: SupabaseClient,
  requestId: string,
  reason: string,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('ai_find_requests')
      .select('status')
      .eq('id', requestId)
      .maybeSingle();
    const status = (existing?.status as string | undefined) ?? null;
    if (!status || status === 'complete' || status === 'refunded' || status === 'failed') {
      return;
    }

    await supabase
      .from('ai_find_requests')
      .update({
        status: 'failed',
        error_message: reason.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);
  } catch (err) {
    console.error('[stripe-webhook] markStuckAiFindRequestFailed errored', err);
  }
}

// --- Handler: Vano Pay checkout completed ---------------------------------
// Under escrow, this flips the row to 'paid' (HELD on the platform)
// and stamps auto_release_at. The release window depends on whether
// the hirer set a deadline at checkout:
//   - No deadline → flat 14 days from now (legacy behaviour)
//   - Deadline set → deadline + 72h grace, clamped to a 48h floor /
//                    30-day ceiling from now (so even a same-day
//                    deadline gives the hirer a review window).
// Either way, release-vano-payment (manual hirer release) and the
// auto-release cron (passive sweep) handle the actual transfer to
// the freelancer when the timer expires or the hirer acts first.
async function handleVanoPayCheckoutCompleted(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  paymentId: string,
): Promise<Response> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Read the row first to pick up the optional deadline_at the
  // checkout function stamped on insert. Two-round-trip is fine
  // here — both queries are by primary key, sub-millisecond. If
  // deadline_at column doesn't exist yet (production DB hasn't
  // applied the migration), the SELECT silently returns null for
  // it and we fall back to the legacy flat hold.
  const { data: existing, error: readError } = await supabase
    .from('vano_payments')
    .select('id, deadline_at')
    .eq('id', paymentId)
    .maybeSingle();

  if (readError) {
    console.error('[stripe-webhook] vano_payments read failed', readError);
    return new Response('DB error', { status: 500 });
  }

  const deadlineRaw = (existing as { deadline_at?: string | null } | null)?.deadline_at ?? null;
  const deadlineMs = deadlineRaw ? Date.parse(deadlineRaw) : null;
  const autoReleaseIso = new Date(
    computeAutoReleaseMs(nowMs, Number.isFinite(deadlineMs) ? deadlineMs as number : null),
  ).toISOString();

  // Tick the conversation's updated_at so the payment "bumps" the
  // thread in the hirer + freelancer inboxes — same UX cue they'd
  // get from a new message, so the held payment is visibly new.
  const { data: flipped, error: flipError } = await supabase
    .from('vano_payments')
    .update({
      status: 'paid',
      stripe_payment_intent_id: session.payment_intent ?? null,
      paid_at: nowIso,
      auto_release_at: autoReleaseIso,
    })
    .eq('id', paymentId)
    .eq('stripe_session_id', session.id)
    .eq('status', 'awaiting_payment')
    .select('id, conversation_id')
    .maybeSingle();

  if (flipError) {
    console.error('[stripe-webhook] vano_payments flip failed', flipError);
    return new Response('DB error', { status: 500 });
  }
  if (!flipped) {
    return new Response(JSON.stringify({ received: true, replay: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (flipped.conversation_id) {
    const { error: bumpError } = await supabase
      .from('conversations')
      .update({ updated_at: nowIso })
      .eq('id', flipped.conversation_id);
    if (bumpError) {
      console.warn('[stripe-webhook] conversation bump failed', bumpError.message);
    }
  }

  return new Response(JSON.stringify({ received: true, triggered: 'vano_pay', state: 'held' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Handler: Connect account.updated -------------------------------------
// Fires every time a freelancer's Connect Express account changes:
// onboarding complete, new capability enabled, or a restriction
// triggered. We care about charges_enabled && payouts_enabled being
// the gate for whether Vano Pay is usable against this freelancer.
async function handleAccountUpdated(
  supabase: SupabaseClient,
  account: StripeAccount,
): Promise<Response> {
  if (!account?.id) {
    return new Response('Missing account id', { status: 400 });
  }

  const ready = !!(account.charges_enabled && account.payouts_enabled);

  const { error } = await supabase
    .from('student_profiles')
    .update({ stripe_payouts_enabled: ready })
    .eq('stripe_account_id', account.id);

  if (error) {
    console.error('[stripe-webhook] account.updated DB write failed', error);
    return new Response('DB error', { status: 500 });
  }

  // Household helpers carry their Connect account on household_helpers
  // (keyed by user_id), not student_profiles. The same account id space
  // is shared, so flip readiness there too — only the matching row (if
  // any) updates. Non-fatal: a failure here shouldn't 500 the webhook
  // and trigger Stripe retries for the freelancer write that succeeded.
  const { error: helperError } = await supabase
    .from('household_helpers')
    .update({ stripe_payouts_enabled: ready })
    .eq('stripe_account_id', account.id);

  if (helperError) {
    console.error('[stripe-webhook] account.updated household_helpers write failed', helperError);
  }

  return new Response(JSON.stringify({ received: true, updated: 'connect_account', ready }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Types ----------------------------------------------------------------
type StripeCheckoutSession = {
  id?: string;
  payment_status?: string;
  payment_intent?: string;
  client_reference_id?: string;
  subscription?: string;
  customer?: string;
  /** Total charged in cents — used so the confirmation email states the amount. */
  amount_total?: number;
  metadata?: Record<string, string | undefined>;
  customer_details?: { email?: string | null; name?: string | null; phone?: string | null };
};

type StripeSubscription = {
  id?: string;
  customer?: string;
  metadata?: Record<string, string | undefined>;
};

type StripeAccount = {
  id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
};

type StripeCharge = {
  id?: string;
  payment_intent?: string;
  amount_refunded?: number;
  refunded?: boolean;
  /** false = the charge was never captured (an auth hold being released).
   *  Pre-basil API versions emit charge.refunded for hold releases — those
   *  must be ignored, not treated as real refunds. */
  captured?: boolean;
  metadata?: Record<string, string | undefined>;
};

function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

// --- Referral settlement (give €5, get €5) --------------------------------
// Runs after a household booking payment lands, from the metadata that
// notify-household-accepted stamped on the Stripe session:
//   referral_welcome_id → the referee just paid their first booking, so the
//                         referrer's €5 flips pending → earned (spendable).
//   redeem_referral_id  → the referrer just spent an earned €5 on this
//                         booking, so it flips earned → redeemed.
// Both filters include the expected current status, making replays no-ops.
// Always fire-and-forget: referral bookkeeping must never block payments.
async function settleReferrals(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  bookingId: string,
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const welcomeId = session.metadata?.referral_welcome_id;
    if (welcomeId) {
      const { error: refErr } = await supabase
        .from('household_referrals')
        .update({ status: 'earned', earned_at: nowIso })
        .eq('id', welcomeId)
        .eq('status', 'pending');
      if (refErr) console.warn('[stripe-webhook] referral earn flip failed', refErr);
    }
    const redeemId = session.metadata?.redeem_referral_id;
    if (redeemId) {
      const { error: redeemErr } = await supabase
        .from('household_referrals')
        .update({ status: 'redeemed', redeemed_at: nowIso, redeemed_booking_id: bookingId })
        .eq('id', redeemId)
        .eq('status', 'earned');
      if (redeemErr) console.warn('[stripe-webhook] referral redeem flip failed', redeemErr);
    }
  } catch (e) {
    console.warn('[stripe-webhook] referral bookkeeping error (non-fatal)', e);
  }
}

// --- Handler: household plan subscription started -------------------------
// HomePlans self-serve flow: create-plan-checkout opened a subscription
// Checkout; the customer just completed it. Record the subscription
// (idempotent on stripe_subscription_id), welcome the customer, ping admin
// so the team schedules the first visit.
async function handleHouseholdPlanSubscribed(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  planSlug: string,
): Promise<Response> {
  const name  = session.metadata?.plan_customer_name ?? null;
  const phone = session.metadata?.plan_customer_phone ?? session.customer_details?.phone ?? null;
  const city  = session.metadata?.plan_city ?? null;
  const email = session.customer_details?.email ?? null;

  const PLAN_LABELS: Record<string, string> = {
    'family': 'Family (€80/mo)',
    'home-pass': 'Home Pass (€99/mo)',
    'family-plus': 'Family Plus (€149/mo)',
  };
  const planLabel = PLAN_LABELS[planSlug] ?? planSlug;

  try {
    // A one-off away-cover checkout has NO subscription, so keying the upsert
    // on stripe_subscription_id (null) never dedupes — a Stripe redelivery of
    // the same checkout.session.completed would insert a SECOND row (duplicate
    // welcome email + admin page). Fall back to the stable checkout-session id
    // as the conflict key so redelivery is idempotent. Session ids ('cs_…') and
    // subscription ids ('sub_…') never collide, so the UNIQUE index still holds.
    const idempKey = session.subscription ?? session.id ?? null;
    const { error: insErr } = await supabase
      .from('household_plan_subscriptions')
      .upsert({
        plan: planSlug,
        customer_name: name,
        customer_phone: phone,
        customer_email: email,
        city,
        stripe_subscription_id: idempKey,
        stripe_customer_id: session.customer ?? null,
        config: session.metadata?.autopilot_config ?? null,
        status: 'active',
      }, { onConflict: 'stripe_subscription_id', ignoreDuplicates: true });
    if (insErr) console.warn('[stripe-webhook] plan subscription insert failed', insErr);
  } catch (e) {
    console.warn('[stripe-webhook] plan subscription insert threw', e);
  }

  const notifyPromise = (async () => {
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) return;
    const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

    // Welcome the customer
    if (email) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [email],
            subject: `Welcome to VANO ${planLabel.split(' (')[0]} — your home is on autopilot 🎉`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">You're all set 🎉</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${name ?? 'there'},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${planLabel}</strong> is active. Here's what happens next:</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
    1. We'll <strong>WhatsApp you within the hour</strong> to schedule your first visit<br>
    2. We match you with your <strong>regular helper</strong> — same friendly face every week<br>
    3. Sit back — your weekly visit just happens
    </p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:13px;line-height:1.6;">Pause or cancel anytime — just message us on WhatsApp.</p>
    <a href="https://wa.me/353899817111" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">WhatsApp us →</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">VANO · ${siteUrl}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${name ?? 'there'}, your ${planLabel} is active! We'll WhatsApp you within the hour to schedule your first visit and match your regular helper. Pause or cancel anytime: https://wa.me/353899817111`,
          }),
        });
      } catch (e) {
        console.warn('[stripe-webhook] plan welcome email error', e);
      }
    }

    // Ping admin — a new recurring customer needs scheduling NOW
    try {
      const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [adminEmail],
          subject: `🏠 NEW PLAN SUBSCRIBER — ${planLabel} — ${name ?? '?'}`,
          text: [
            'New monthly plan subscription! Schedule their first visit ASAP (customer was told within the hour).',
            `Plan: ${planLabel}`,
            `Name: ${name ?? '—'}`,
            `Phone: ${phone ?? '—'}`,
            `Email: ${email ?? '—'}`,
            `City: ${city ?? '—'}`,
            `Stripe subscription: ${session.subscription ?? '—'}`,
          ].join('\n'),
        }),
      });
    } catch (e) {
      console.warn('[stripe-webhook] plan admin email error', e);
    }

    // WhatsApp ping via the existing admin channel
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_booking',
          customer_name: `${name ?? '?'} — NEW ${planLabel} SUBSCRIBER`,
          customer_phone: phone,
          customer_email: email,
          category: `plan:${planSlug}`,
          scheduled_date: 'Schedule first visit within the hour',
          city,
          price_euros: planSlug === 'family' ? '80.00' : planSlug === 'home-pass' ? '99.00' : '149.00',
          booking_id: session.subscription ?? session.id ?? 'plan',
        }),
      });
    } catch (e) {
      console.warn('[stripe-webhook] plan admin whatsapp error', e);
    }

    // Auto-match: offer this plan to opted-in helpers (first to claim becomes
    // the regular). Fire-and-forget — admin scheduling stays the fallback, and
    // dispatch-autopilot-plan no-ops if nobody has opted in yet.
    try {
      if (session.subscription) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const { data: planRow } = await supabase
          .from('household_plan_subscriptions').select('id')
          .eq('stripe_subscription_id', session.subscription).maybeSingle();
        const planId = (planRow as { id?: string } | null)?.id;
        if (planId) {
          await fetch(`${supabaseUrl}/functions/v1/dispatch-autopilot-plan`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId }),
          });
        }
      }
    } catch (e) {
      console.warn('[stripe-webhook] autopilot dispatch error', e);
    }
  })();

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(notifyPromise);

  return new Response(
    JSON.stringify({ received: true, triggered: 'household_plan', plan: planSlug }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// --- Handler: subscription cancelled ---------------------------------------
// Keeps household_plan_subscriptions honest when a plan is cancelled from
// the Stripe dashboard or by the customer. No row → not a plan sub → no-op.
async function handlePlanSubscriptionDeleted(
  supabase: SupabaseClient,
  sub: StripeSubscription,
): Promise<Response> {
  if (!sub?.id) {
    return new Response(JSON.stringify({ received: true, ignored: 'no_subscription_id' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const nowIso = new Date().toISOString();
  const { data: flipped, error } = await supabase
    .from('household_plan_subscriptions')
    .update({ status: 'cancelled', cancelled_at: nowIso })
    .eq('stripe_subscription_id', sub.id)
    .eq('status', 'active')
    .select('plan, customer_name, customer_phone')
    .maybeSingle();

  if (error) {
    console.warn('[stripe-webhook] plan cancel flip failed', error);
  }
  if (flipped) {
    try {
      const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
      const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com';
      const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [adminEmail],
            subject: `❌ Plan cancelled — ${(flipped as { plan?: string }).plan} — ${(flipped as { customer_name?: string }).customer_name ?? '?'}`,
            text: `Plan subscription cancelled.\nPlan: ${(flipped as { plan?: string }).plan}\nCustomer: ${(flipped as { customer_name?: string }).customer_name ?? '—'} (${(flipped as { customer_phone?: string }).customer_phone ?? '—'})\nStripe sub: ${sub.id}`,
          }),
        });
      }
    } catch (e) {
      console.warn('[stripe-webhook] plan cancel admin email error', e);
    }
  }
  return new Response(
    JSON.stringify({ received: true, triggered: flipped ? 'plan_cancelled' : 'plan_cancel_noop' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// Quick-book bookings carry customer_name='Guest' until payment, because the
// name was always meant to come from Stripe — backfill it the moment the
// checkout session tells us. Write-once: only replaces the 'Guest' literal.
async function backfillGuestName(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  bookingId: string,
): Promise<void> {
  try {
    const name = session.customer_details?.name?.trim();
    if (!name || name.length < 2) return;
    await supabase
      .from('household_bookings')
      .update({ customer_name: name.slice(0, 120) })
      .eq('id', bookingId)
      .eq('customer_name', 'Guest');
  } catch (e) {
    console.warn('[stripe-webhook] guest name backfill failed (non-fatal)', e);
  }
}

// --- Handler: household fee AUTHORIZED (auth-at-booking) ------------------
// The manual-capture Checkout session minted at BOOKING time just completed:
// the customer's card now holds the Vano fee, but nothing is captured yet
// (that happens when a helper accepts — see notify-household-accepted).
// IMPORTANT: these sessions legitimately complete with payment_status
// 'unpaid' (the PI sits at requires_capture), so this handler is routed
// BEFORE the generic unpaid guard, keyed on metadata.vano_fee_auth.
// Flip awaiting_payment → pending, store the real pi_, clear the dead
// session URL, stamp fee_authorized_at, and dispatch — paid_at stays NULL.
async function handleHouseholdFeeAuthorized(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  bookingId: string,
): Promise<Response> {
  const nowIso = new Date().toISOString();
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Belt-and-braces: confirm the intent really is an uncaptured hold. If it
  // somehow arrived already captured (dashboard capture, config drift), the
  // legacy paid path is the correct handler.
  if (stripeKey && session.payment_intent) {
    try {
      const piResp = await fetch(
        `${(Deno.env.get('STRIPE_API_BASE') ?? 'https://api.stripe.com').replace(/\/$/, '')}/v1/payment_intents/${session.payment_intent}`,
        { headers: { Authorization: `Bearer ${stripeKey}` } },
      );
      if (piResp.ok) {
        const pi = await piResp.json() as { status?: string };
        if (pi.status === 'succeeded') {
          return handleHouseholdCheckoutCompleted(supabase, session, bookingId);
        }
        if (pi.status !== 'requires_capture') {
          console.warn('[stripe-webhook] fee-auth session with unexpected PI status', bookingId, pi.status);
          return new Response(JSON.stringify({ received: true, ignored: `pi_${pi.status}` }), { headers: { 'Content-Type': 'application/json' } });
        }
      }
    } catch (e) {
      // Verification is best-effort — the CAS below is the real guard.
      console.warn('[stripe-webhook] fee-auth PI verify failed (continuing)', e);
    }
  }

  const customerEmail = session.customer_details?.email ?? null;
  const { data: flipped, error } = await supabase
    .from('household_bookings')
    .update({
      status: 'pending',
      stripe_payment_intent_id: session.payment_intent ?? null,
      // The completed session's URL is dead — leaving it would resurrect the
      // tracking page's pay cards for a booking that needs no payment action.
      stripe_checkout_url: null,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    })
    .eq('id', bookingId)
    .eq('status', 'awaiting_payment')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, scheduled_at, city, price_estimate_cents, booking_data')
    .maybeSingle();

  if (error) {
    console.error('[stripe-webhook] fee-auth flip failed', error);
    return new Response('DB error', { status: 500 });
  }

  if (!flipped) {
    // Replay, or the booking died before the customer finished checkout.
    const { data: existing } = await supabase
      .from('household_bookings')
      .select('status, paid_at, category, customer_phone')
      .eq('id', bookingId)
      .maybeSingle() as { data: { status?: string; paid_at?: string | null; category?: string; customer_phone?: string | null } | null };
    if (existing?.status === 'cancelled' && !existing.paid_at && session.payment_intent && stripeKey) {
      // The hold landed on a cancelled booking. An uncaptured PI cannot be
      // refunded — CANCEL it so the hold releases (mirror of the orphan-
      // charge refund guard, for holds).
      const released = await releaseBookingMoney({
        stripeKey,
        action: 'cancel_pi',
        stripeId: session.payment_intent,
        idemSuffix: bookingId,
        apiBase: Deno.env.get('STRIPE_API_BASE') ?? undefined,
      });
      await supabase.rpc('merge_booking_data', {
        p_id: bookingId,
        p_patch: { fee_auth_canceled_at: nowIso },
      }).then(() => {}, () => {});
      const ref = bookingId.slice(-8).toUpperCase();
      await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${released.ok ? '↩️ *Hold released on cancelled booking*' : '🚨 *Stray card hold — cancel it in Stripe*'} (${ref})\nA customer completed the card step for a ${existing.category ?? 'job'} that was already cancelled. ${released.ok ? 'The hold was released automatically — they were never charged.' : 'Auto-release FAILED — cancel the uncaptured PaymentIntent in the Stripe dashboard.'}`,
          subject: `${released.ok ? '↩️ Hold released (cancelled booking)' : '🚨 Stray card hold — manual cancel'} (${ref})`,
          contact_phone: existing.customer_phone ?? undefined,
        }),
      }).catch(() => {});
      return new Response(JSON.stringify({ received: true, orphan_hold_released: released.ok }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ received: true, replay: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  await backfillGuestName(supabase, session, bookingId);
  await supabase.rpc('merge_booking_data', {
    p_id: bookingId,
    p_patch: { fee_authorized_at: nowIso },
  }).then(() => {}, () => {});

  // Card on file for future one-tap bookings — same upsert as the paid path.
  const phone = (flipped as { customer_phone?: string }).customer_phone;
  if (session.customer && phone) {
    try {
      await supabase.from('household_customers').upsert({
        phone: phone.trim(),
        stripe_customer_id: session.customer,
        updated_at: nowIso,
      }, { onConflict: 'phone' });
    } catch (e) {
      console.warn('[stripe-webhook] household_customers upsert failed (non-fatal)', e);
    }
  }

  // Dispatch — the booking is now secured, get it in front of helpers. Only
  // when due: far-out scheduled bookings wait for dispatch-scheduled-jobs
  // (which selects status='pending' and now sees this row). Mirrors the
  // LEAD_MIN=90 rule in create-household-payment-checkout.
  const scheduledAtRaw = (flipped as { scheduled_at?: string | null }).scheduled_at;
  const scheduledMs = scheduledAtRaw ? Date.parse(scheduledAtRaw) : NaN;
  const dispatchNow = !Number.isFinite(scheduledMs) || (scheduledMs - Date.now()) <= 90 * 60 * 1000;
  const dispatchPromise = dispatchNow
    ? (async () => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ record: { ...flipped, status: 'pending' } }),
          });
        } catch (e) {
          console.warn('[stripe-webhook] fee-auth dispatch call failed (non-fatal)', e);
        }
      })()
    : Promise.resolve();

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(dispatchPromise);

  return new Response(
    JSON.stringify({ received: true, triggered: 'household_fee_authorized', dispatched: dispatchNow }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// --- Handler: household checkout.session.completed -----------------------
// Two payment flows land here:
//   1. Legacy pay-first: booking sits at awaiting_payment until the customer
//      pays → flip to pending + dispatch. Kept so links created before the
//      pay-after-accept rollout still work.
//   2. Pay-after-accept (current): the booking is already live and accepted;
//      the session was created by notify-household-accepted. Stamp paid_at +
//      the real PaymentIntent id, email the customer a receipt, ping admin.
// (Auth-at-booking sessions — metadata.vano_fee_auth — are routed to
// handleHouseholdFeeAuthorized BEFORE this and never land here.)
async function handleHouseholdCheckoutCompleted(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  bookingId: string,
): Promise<Response> {
  const customerEmail = session.customer_details?.email ?? null;
  const nowIso = new Date().toISOString();

  const { data: flipped, error } = await supabase
    .from('household_bookings')
    .update({
      status: 'pending',
      paid_at: nowIso,
      stripe_payment_intent_id: session.payment_intent ?? null,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    })
    .eq('id', bookingId)
    .eq('status', 'awaiting_payment')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, city, price_estimate_cents')
    .maybeSingle();

  // Quick-book stores customer_name='Guest' (pay-after-accept means Stripe
  // never named them at booking time). The card just told us who they are —
  // backfill so helpers, chat and emails show a real name. Best-effort.
  await backfillGuestName(supabase, session, bookingId);

  if (error) {
    console.error('[stripe-webhook] household booking flip failed', error);
    return new Response('DB error', { status: 500 });
  }
  if (!flipped) {
    return handleHouseholdPostAcceptPayment(supabase, session, bookingId, customerEmail, nowIso);
  }

  // Send confirmation email via Resend — fire and forget
  const emailPromise = (async () => {
    try {
      const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
      const toEmail = (flipped as { customer_email?: string }).customer_email;
      if (!resendKey || !toEmail) return;

      const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
      const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
      const trackUrl = `${siteUrl}/track/${bookingId}`;
      const rawName = (flipped as { customer_name?: string }).customer_name;
      const name = rawName && rawName !== 'Guest' ? rawName : 'there';
      const category = (flipped as { category?: string }).category || 'your job';
      const when = (flipped as { scheduled_date?: string }).scheduled_date || '';

      const categoryLabels: Record<string, string> = {
        shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
        moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
      };
      const categoryLabel = categoryLabels[category] ?? category;

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Booking confirmed ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${categoryLabel}</strong>${when ? ' for ' + when : ''} is confirmed. We're finding you a helper now and you'll get a text with their name and photo within minutes.</p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Track your booking →</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Ref: ${bookingId.slice(-8).toUpperCase()}</p>
  </div>
</div>
</body></html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [toEmail],
          subject: `Your VANO ${categoryLabel} is confirmed!`,
          html,
          text: `Hi ${name}, your ${categoryLabel}${when ? ' for ' + when : ''} is confirmed. Track here: ${trackUrl}`,
        }),
      });
    } catch (e) {
      console.warn('[stripe-webhook] household confirmation email error', e);
    }
  })();

  // Notify admin via WhatsApp + email — fire and forget
  const adminNotifyPromise = (async () => {
    const b = flipped as {
      customer_name?: string; customer_email?: string; customer_phone?: string;
      category?: string; scheduled_date?: string; city?: string; price_estimate_cents?: number;
    };
    const categoryLabels: Record<string, string> = {
      shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
      moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
    };
    const cat = categoryLabels[b.category ?? ''] ?? b.category ?? 'Job';
    const priceStr = b.price_estimate_cents ? `€${(b.price_estimate_cents / 100).toFixed(2)}` : '?';
    const ref = bookingId.slice(-8).toUpperCase();

    // WhatsApp ping via notify-admin-whatsapp edge function
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'new_booking',
          customer_name: b.customer_name,
          customer_phone: b.customer_phone,
          customer_email: b.customer_email,
          category: b.category,
          scheduled_date: b.scheduled_date,
          city: b.city,
          price_euros: b.price_estimate_cents ? (b.price_estimate_cents / 100).toFixed(2) : '?',
          booking_id: bookingId,
        }),
      });
    } catch (e) {
      console.warn('[stripe-webhook] admin whatsapp notify error', e);
    }

    // Email fallback
    try {
      const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
      if (!resendKey) return;
      const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: resendFrom,
          to: ['vano1app@gmail.com'],
          subject: `💰 New booking — ${cat} in ${b.city ?? '?'} (${priceStr})`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px">New paid booking 💰</h2>
<table style="width:100%;border-collapse:collapse;font-size:15px">
<tr><td style="padding:6px 0;color:#6b7280">Job</td><td style="padding:6px 0;font-weight:600">${cat}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Customer</td><td style="padding:6px 0">${b.customer_name ?? '—'}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Phone</td><td style="padding:6px 0">${b.customer_phone ?? '—'}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0">${b.customer_email ?? '—'}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">City</td><td style="padding:6px 0">${b.city ?? '—'}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">When</td><td style="padding:6px 0">${b.scheduled_date ?? 'Flexible'}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Paid</td><td style="padding:6px 0;font-weight:600;color:#16a34a">${priceStr}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Ref</td><td style="padding:6px 0;font-family:monospace">${ref}</td></tr>
</table>
</div>`,
          text: `New booking!\nJob: ${cat}\nCustomer: ${b.customer_name}\nPhone: ${b.customer_phone ?? '—'}\nEmail: ${b.customer_email ?? '—'}\nCity: ${b.city}\nWhen: ${b.scheduled_date ?? 'Flexible'}\nPaid: ${priceStr}\nRef: ${ref}`,
        }),
      });
    } catch (e) {
      console.warn('[stripe-webhook] admin email notify error', e);
    }
  })();

  // Auto-dispatch the job to eligible helpers — fire and forget.
  // Finds up to 3 approved + available helpers in the same city and
  // emails them the job with a 15-minute claim window.
  // Uses the same booking record already returned from the flip above,
  // so no extra DB read needed. If dispatch fails for any reason it is
  // silently swallowed — admin WhatsApp above is the fallback.
  const dispatchPromise = (async () => {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ record: { ...flipped, status: 'pending' } }),
      });
    } catch (e) {
      console.warn('[stripe-webhook] dispatch-household-job call failed (non-fatal)', e);
    }
  })();

  const referralPromise = settleReferrals(supabase, session, bookingId);

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(emailPromise);
    runtime.waitUntil(adminNotifyPromise);
    runtime.waitUntil(dispatchPromise);
    runtime.waitUntil(referralPromise);
  }

  return new Response(
    JSON.stringify({ received: true, triggered: 'household_booking', state: 'pending' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// --- Handler: household post-accept payment -------------------------------
// Pay-after-accept flow: the booking was dispatched at creation, a helper
// accepted, notify-household-accepted created the checkout session, and the
// customer just paid it. Stamp paid_at (idempotent — replays no-op on the
// is-null filter), store the real PaymentIntent id, confirm to customer,
// ping admin. No dispatch — the job already has its helper.
async function handleHouseholdPostAcceptPayment(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  bookingId: string,
  customerEmail: string | null,
  nowIso: string,
): Promise<Response> {
  const { data: paidRow, error } = await supabase
    .from('household_bookings')
    .update({
      paid_at: nowIso,
      stripe_payment_intent_id: session.payment_intent ?? null,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    })
    .eq('id', bookingId)
    .is('paid_at', null)
    // Never stamp a payment onto a booking that was already given up on — the
    // customer may be paying a stale link after the booking was released/
    // cancelled. Those land in the orphan-charge guard below.
    .neq('status', 'cancelled')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, city, price_estimate_cents, status')
    .maybeSingle();

  await backfillGuestName(supabase, session, bookingId);

  if (error) {
    console.error('[stripe-webhook] post-accept payment stamp failed', error);
    return new Response('DB error', { status: 500 });
  }
  if (!paidRow) {
    // Nothing was stamped: either a genuine replay (already paid) or a payment
    // that landed on a CANCELLED booking (stale pay link paid after release).
    // Distinguish, and auto-refund the orphan charge so money never sits on a
    // dead booking waiting for a manual dashboard refund.
    const { data: existing } = await supabase
      .from('household_bookings')
      .select('status, paid_at, category, customer_phone, stripe_payment_intent_id')
      .eq('id', bookingId)
      .maybeSingle() as { data: { status?: string; paid_at?: string | null; category?: string; customer_phone?: string | null; stripe_payment_intent_id?: string | null } | null };

    // Genuine DOUBLE payment: the booking is already paid, but THIS session
    // settled a DIFFERENT PaymentIntent than the one on file (e.g. the customer
    // paid a stale pay-link after a helper re-accept minted a fresh session).
    // Without this it fell through to replay:true and the second charge was
    // silently kept. Auto-refund the duplicate and page the owner.
    if (
      existing?.paid_at && session.payment_intent &&
      existing.stripe_payment_intent_id && existing.stripe_payment_intent_id !== session.payment_intent
    ) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      let refunded = false;
      if (stripeKey) {
        try {
          const r = await fetch('https://api.stripe.com/v1/refunds', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${stripeKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              // Key on the DUPLICATE intent so two deliveries of this event
              // don't double-refund, and it can't collide with the orphan key.
              'Idempotency-Key': `vano_dup_refund_${session.payment_intent}`,
            },
            body: new URLSearchParams({ payment_intent: session.payment_intent, reason: 'duplicate' }).toString(),
          });
          refunded = r.ok;
          if (!r.ok) console.error('[stripe-webhook] duplicate auto-refund failed', bookingId, r.status, (await r.text()).slice(0, 200));
        } catch (e) { console.error('[stripe-webhook] duplicate auto-refund threw', bookingId, e); }
      }
      const ref = bookingId.slice(-8).toUpperCase();
      await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${refunded ? '↩️ *Auto-refunded duplicate charge*' : '🚨 *Duplicate charge — refund by hand*'} (${ref})\nA customer paid twice for the same ${existing.category ?? 'job'} (a second, stale pay link). ${refunded ? 'The duplicate was refunded automatically.' : 'Auto-refund FAILED — refund the second charge in Stripe.'}`,
          subject: `${refunded ? '↩️ Duplicate charge auto-refunded' : '🚨 Duplicate charge — manual refund'} (${ref})`,
          contact_phone: existing.customer_phone ?? undefined,
        }),
      }).catch(() => {});
      return new Response(JSON.stringify({ received: true, duplicate_refunded: refunded }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (existing?.status === 'cancelled' && !existing.paid_at && session.payment_intent) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
      let refunded = false;
      if (stripeKey) {
        try {
          const r = await fetch('https://api.stripe.com/v1/refunds', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${stripeKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'Idempotency-Key': `vano_orphan_refund_${bookingId}`,
            },
            body: new URLSearchParams({ payment_intent: session.payment_intent, reason: 'requested_by_customer' }).toString(),
          });
          refunded = r.ok;
          if (!r.ok) console.error('[stripe-webhook] orphan auto-refund failed', bookingId, r.status, (await r.text()).slice(0, 200));
        } catch (e) { console.error('[stripe-webhook] orphan auto-refund threw', bookingId, e); }
      }
      const ref = bookingId.slice(-8).toUpperCase();
      await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${refunded ? '↩️ *Auto-refunded orphan charge*' : '🚨 *Orphan charge — refund by hand*'} (${ref})\nA customer paid a stale link for a ${existing.category ?? 'job'} that was already cancelled. ${refunded ? 'Refund issued automatically.' : 'Auto-refund FAILED — refund in the Stripe dashboard.'}`,
          subject: `${refunded ? '↩️ Orphan charge auto-refunded' : '🚨 Orphan charge — manual refund'} (${ref})`,
          contact_phone: existing.customer_phone ?? undefined,
        }),
      }).catch(() => {});
      return new Response(JSON.stringify({ received: true, orphan_cancelled: true, refunded }), { headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ received: true, replay: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const b = paidRow as {
    customer_name?: string; customer_email?: string; customer_phone?: string;
    category?: string; scheduled_date?: string; city?: string; price_estimate_cents?: number;
  };

  // Card on file: remember this household's Stripe customer id by phone so a
  // future booking can be charged off-session with no pay step. Best-effort —
  // the card was saved on the session (customer_creation + setup_future_usage).
  if (session.customer && b.customer_phone) {
    try {
      await supabase.from('household_customers').upsert({
        phone: b.customer_phone.trim(),
        stripe_customer_id: session.customer,
        updated_at: nowIso,
      }, { onConflict: 'phone' });
    } catch (e) {
      console.warn('[stripe-webhook] household_customers upsert failed', e);
    }
  }
  const categoryLabels: Record<string, string> = {
    shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
    moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
    handyman: 'Handyman', plumbing: 'Plumbing help',
    'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
    'wait-delivery': 'Wait for delivery', other: 'General help',
  };
  const catLabel = categoryLabels[b.category ?? ''] ?? b.category ?? 'job';
  const ref = bookingId.slice(-8).toUpperCase();
  // A confirmation that never states the amount isn't a receipt — show what
  // was actually charged (Stripe's session total includes the service fee).
  const paidStr = typeof session.amount_total === 'number' && session.amount_total > 0
    ? `€${(session.amount_total / 100).toFixed(2)}`
    : null;
  const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
  const trackUrl = `${siteUrl}/track/${bookingId}`;
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';

  const notifyPromise = (async () => {
    const toEmail = b.customer_email;
    if (resendKey && toEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [toEmail],
            subject: `Payment received — your ${catLabel} is locked in ✓`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Payment received ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${b.customer_name && b.customer_name !== 'Guest' ? b.customer_name : 'there'},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${catLabel}</strong> is fully confirmed — helper booked, payment sorted. Nothing more to do. You'll get a message (with a live map) when your helper is on the way.</p>
    ${paidStr ? `<p style="margin:0 0 24px;color:#111827;font-size:15px;"><strong>Amount paid: ${paidStr}</strong> <span style="color:#6b7280;font-size:13px;">(held safely until you confirm the job's done)</span></p>` : ''}
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Track your booking →</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${b.customer_name && b.customer_name !== 'Guest' ? b.customer_name : 'there'}, payment received${paidStr ? ` (${paidStr})` : ''} — your ${catLabel} is fully confirmed. Track: ${trackUrl}. Ref: ${ref}`,
          }),
        });
      } catch (e) {
        console.warn('[stripe-webhook] post-accept customer email error', e);
      }
    }
    if (resendKey) {
      try {
        const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com';
        const priceStr = b.price_estimate_cents ? `€${(b.price_estimate_cents / 100).toFixed(2)}` : '?';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [adminEmail],
            subject: `💰 PAID — ${catLabel} in ${b.city ?? '?'} (${priceStr}) — ${ref}`,
            text: [
              `Customer paid after helper acceptance.`,
              `Job: ${catLabel}`,
              `Customer: ${b.customer_name ?? '—'} (${b.customer_phone ?? '—'})`,
              `City: ${b.city ?? '—'}`,
              `Job price: ${priceStr} (+ service fee paid on top)`,
              `Ref: ${ref}`,
            ].join('\n'),
          }),
        });
      } catch (e) {
        console.warn('[stripe-webhook] post-accept admin email error', e);
      }
    }
  })();

  const referralPromise = settleReferrals(supabase, session, bookingId);

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(notifyPromise);
    runtime.waitUntil(referralPromise);
  }

  return new Response(
    JSON.stringify({ received: true, triggered: 'household_booking', state: 'paid_post_accept' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// --- Handler: charge.refunded --------------------------------------------
// Fires when a refund lands — either from our refund-vano-payment
// function (already flipped the row before the webhook lands) or from
// ops refunding via the Stripe dashboard / a cardholder chargeback
// path we don't control. Idempotent on both cases: if the row is
// already 'refunded' we no-op; otherwise we flip it so the UI stays
// honest even for out-of-band refunds.
async function handleChargeRefunded(
  supabase: SupabaseClient,
  charge: StripeCharge,
): Promise<Response> {
  if (!charge?.payment_intent) {
    return new Response(JSON.stringify({ received: true, ignored: 'no_payment_intent' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Stripe fires charge.refunded on PARTIAL refunds too. Treating a partial
  // refund as a full one would cancel a live job and withhold the helper's
  // ENTIRE payout over a small goodwill refund (and, on the legacy pot, flip
  // the whole escrow row 'refunded' so the freelancer loses the unrefunded
  // remainder). Only act when the charge is FULLY refunded. Partial refunds
  // need a human decision, so no-op here.
  if (charge.refunded === false) {
    return new Response(JSON.stringify({ received: true, ignored: 'partial_refund' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // A NEVER-CAPTURED charge being "refunded" is an auth hold being released
  // (older Stripe API versions emit charge.refunded when an uncaptured PI is
  // cancelled). That's the normal end of a no-match/cancelled auth booking —
  // treating it as a real refund would stamp refunded_at and CANCEL a live
  // booking whose hold was simply replaced.
  if (charge.captured === false) {
    return new Response(JSON.stringify({ received: true, ignored: 'uncaptured_release' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();

  // Household bookings first: an out-of-band refund (Stripe dashboard,
  // chargeback) must stamp refunded_at on the booking, or
  // capture-household-payment / release-household-payouts would still pay
  // the helper for a job the customer got their money back on.
  const { data: hb } = await supabase
    .from('household_bookings')
    .update({ refunded_at: nowIso })
    .eq('stripe_payment_intent_id', charge.payment_intent)
    .is('refunded_at', null)
    .select('id, status')
    .maybeSingle();
  if (hb) {
    // A refunded job that hasn't finished shouldn't keep running — cancel it
    // unless it already reached a terminal state.
    if (hb.status !== 'completed' && hb.status !== 'cancelled') {
      await supabase
        .from('household_bookings')
        .update({ status: 'cancelled' })
        .eq('id', hb.id)
        .not('status', 'in', '(completed,cancelled)');
      await supabase.from('household_job_updates').insert({
        booking_id: hb.id,
        status: 'cancelled',
        note: 'Payment refunded — booking cancelled.',
      });
    }
    // Kill any not-yet-transferred payout so the release sweep can't pay it.
    await supabase
      .from('household_payouts')
      .update({ status: 'failed', last_transfer_error: 'charge refunded — payout withheld' })
      .eq('booking_id', hb.id)
      .eq('status', 'pending');
    return new Response(JSON.stringify({ received: true, triggered: 'household_charge_refunded' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: flipped, error } = await supabase
    .from('vano_payments')
    .update({
      status: 'refunded',
      refunded_at: nowIso,
      completed_at: nowIso,
      auto_release_at: null,
    })
    .eq('stripe_payment_intent_id', charge.payment_intent)
    .in('status', ['paid', 'awaiting_payment'])
    .select('id, conversation_id')
    .maybeSingle();

  if (error) {
    console.error('[stripe-webhook] charge.refunded DB write failed', error);
    return new Response('DB error', { status: 500 });
  }
  if (!flipped) {
    // Already refunded, already released, or no vano_payments row —
    // all fine. Don't retry.
    return new Response(JSON.stringify({ received: true, replay: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (flipped.conversation_id) {
    await supabase
      .from('conversations')
      .update({ updated_at: nowIso })
      .eq('id', flipped.conversation_id);
  }

  return new Response(JSON.stringify({ received: true, triggered: 'charge_refunded' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// (Removed) handleHelperSubscriptionCompleted — the legacy monthly-membership
// auto-approve. It flipped a helper pending→approved on a subscription payment
// alone, bypassing both Stripe Identity and the €2 sign-up fee. Approval is now
// gated exclusively by the trg_helpers_autoapprove DB trigger (student email +
// ID + €2), so this bypass was deleted rather than left as latent risk.

// --- Handler: €2 helper sign-up fee paid ----------------------------------
// Server-side backstop for confirm-signup-payment. Only pays attention to a
// session that's actually paid; sets signup_paid idempotently (the
// .is('signup_paid', ...) guard makes a replay a no-op) and, if the DB
// auto-approve trigger flipped the helper to 'approved', notifies them.
async function handleHelperSignupPaid(
  supabase: SupabaseClient,
  supabaseUrl: string,
  serviceKey: string,
  session: StripeCheckoutSession,
  helperId: string,
): Promise<Response> {
  if (session.payment_status && session.payment_status !== 'paid') {
    return new Response(JSON.stringify({ received: true, unpaid: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  // Only flip false→true so we can tell whether THIS call completed the set.
  const { data: updated, error } = await supabase
    .from('household_helpers')
    .update({ signup_paid: true })
    .eq('id', helperId)
    .or('signup_paid.is.null,signup_paid.eq.false')
    .select('id, status')
    .maybeSingle() as { data: { id: string; status?: string } | null; error: unknown };

  if (error) {
    console.error('[stripe-webhook] helper signup_paid update failed', error);
    return new Response('DB error', { status: 500 });
  }
  if (!updated) {
    // Already paid (confirm-signup-payment beat us, or a replay) — no-op.
    return new Response(JSON.stringify({ received: true, replay: true }), { headers: { 'Content-Type': 'application/json' } });
  }
  // The trigger may have flipped status to 'approved' in the same write.
  if (updated.status === 'approved') {
    fetch(`${supabaseUrl}/functions/v1/notify-helper-approved`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ helper_id: helperId }),
    }).catch(() => {});
  }
  return new Response(JSON.stringify({ received: true, signup_paid: true, approved: updated.status === 'approved' }), { headers: { 'Content-Type': 'application/json' } });
}

// --- Entry point ----------------------------------------------------------
serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return new Response('Not configured', { status: 500 });
  }

  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) return new Response('Missing signature', { status: 400 });

  const rawBody = await req.text();

  const valid = await verifyStripeSignature(rawBody, sigHeader, STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response('Invalid signature', { status: 400 });

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const eventType = event.type ?? '';

  if (eventType === 'checkout.session.completed') {
    const session = event.data?.object as StripeCheckoutSession | undefined;
    if (!session?.id) {
      return new Response('Missing session id', { status: 400 });
    }

    const aiFindId = session.metadata?.ai_find_request_id;
    const vanoPayId = session.metadata?.vano_payment_id;
    const householdBookingId = session.metadata?.household_booking_id;

    if (aiFindId) {
      return handleAiFindCheckoutCompleted(supabase, supabaseUrl, serviceKey, session, aiFindId);
    }
    if (vanoPayId) {
      return handleVanoPayCheckoutCompleted(supabase, session, vanoPayId);
    }
    if (householdBookingId) {
      // AUTH-AT-BOOKING sessions complete with payment_status 'unpaid' by
      // design (manual capture — the PI sits at requires_capture until a
      // helper accepts), so they MUST be routed before the unpaid guard
      // below or every auth event would be silently swallowed.
      if (session.metadata?.vano_fee_auth === '1') {
        return handleHouseholdFeeAuthorized(supabase, session, householdBookingId);
      }
      // A delayed-notification method (SEPA, Sofort — offered whenever enabled
      // in the Stripe dashboard, since the session doesn't restrict methods)
      // completes the session with payment_status 'unpaid' and only settles
      // later via checkout.session.async_payment_succeeded. Never stamp paid on
      // an unpaid session: it would open the helper's start-gate and pay them
      // out for money that hasn't arrived (and may bounce).
      if (session.payment_status && session.payment_status !== 'paid') {
        return new Response(JSON.stringify({ received: true, unpaid: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      return handleHouseholdCheckoutCompleted(supabase, session, householdBookingId);
    }
    const householdPlan = session.metadata?.household_plan;
    if (householdPlan) {
      return handleHouseholdPlanSubscribed(supabase, session, householdPlan);
    }
    // €2 helper sign-up fee. confirm-signup-payment sets signup_paid from the
    // browser redirect, but a lost redirect (tab closed, wallet bounce, flaky
    // network) left the helper charged-but-stuck-pending forever with no
    // server backstop. This webhook makes the €2 gate as reliable as the
    // Stripe Identity gate — set signup_paid idempotently, let the DB trigger
    // auto-approve, and notify if that completed the set.
    if (session.metadata?.type === 'helper_signup' && session.metadata?.helper_id) {
      return handleHelperSignupPaid(supabase, supabaseUrl, serviceKey, session, session.metadata.helper_id);
    }
    // €2/month ✓ Verified plan. confirm-verified-plan records it from the
    // browser redirect; this is the lost-redirect backstop (same reasoning as
    // the €2 helper_signup above). Idempotent — replays just re-set true.
    if (session.metadata?.type === 'verified_plan' && session.metadata?.helper_id) {
      if (session.payment_status && session.payment_status !== 'paid') {
        return new Response(JSON.stringify({ received: true, unpaid: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      const { error: planErr } = await supabase
        .from('household_helpers')
        .update({
          verified_plan_active: true,
          ...(session.subscription ? { verified_plan_sub_id: session.subscription } : {}),
        })
        .eq('id', session.metadata.helper_id);
      if (planErr) {
        console.error('[stripe-webhook] verified_plan activate failed', planErr);
        return new Response('DB error', { status: 500 });
      }
      return new Response(JSON.stringify({ received: true, verified_plan: 'active' }), { headers: { 'Content-Type': 'application/json' } });
    }
    // NOTE: the legacy monthly-membership auto-approve (a checkout carrying
    // metadata.helper_email → flip pending→approved) was REMOVED. It bypassed
    // BOTH the €2 sign-up fee and Stripe Identity verification, breaking the
    // platform invariant that a helper only goes live once student-email + ID +
    // the €2 fee are ALL done. That is enforced solely by the
    // trg_helpers_autoapprove DB trigger; there is now exactly one automated
    // path to 'approved'. The subscription product is parked, so nothing legit
    // creates a helper_email checkout anymore — such an event falls through.

    // Fallback: look at client_reference_id as an AI Find request id
    // (legacy behaviour before we started setting metadata). If it
    // doesn't match anything, 200 + log and move on — Stripe's happy.
    const fallback = session.client_reference_id;
    if (fallback) {
      return handleAiFindCheckoutCompleted(supabase, supabaseUrl, serviceKey, session, fallback);
    }

    console.warn('[stripe-webhook] session.completed without a recognised id', { sessionId: session.id });
    return new Response(JSON.stringify({ received: true, ignored: 'no_id' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Delayed methods (SEPA/Sofort) settle here, not on checkout.session.completed
  // (which fired 'unpaid'). Route a now-PAID household session through the same
  // stamp path so the booking finally goes paid; ignore an async failure (the
  // booking just stays unpaid and the normal unpaid sweeps handle it).
  if (eventType === 'checkout.session.async_payment_succeeded') {
    const session = event.data?.object as StripeCheckoutSession | undefined;
    const householdBookingId = session?.metadata?.household_booking_id;
    if (session?.id && householdBookingId && session.payment_status === 'paid') {
      return handleHouseholdCheckoutCompleted(supabase, session, householdBookingId);
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Abandoned auth-at-booking checkout: the customer tapped Book but never
  // finished the card step, and the session's 60-min expires_at lapsed.
  // Quietly cancel the awaiting_payment booking (CAS — idempotent against the
  // remind-unpaid cron sweep that backstops a missed webhook). No customer
  // messaging: they never completed anything and were never charged.
  // Requires checkout.session.expired to be enabled on the Stripe endpoint.
  if (eventType === 'checkout.session.expired') {
    const session = event.data?.object as StripeCheckoutSession | undefined;
    const bookingId = session?.metadata?.household_booking_id;
    if (bookingId && session?.metadata?.vano_fee_auth === '1') {
      const { data: cancelled } = await supabase
        .from('household_bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('status', 'awaiting_payment')
        .is('paid_at', null)
        .select('id')
        .maybeSingle();
      if (cancelled) {
        await supabase.from('household_job_updates').insert({
          booking_id: bookingId,
          status: 'cancelled',
          note: 'Card step not completed — booking expired quietly. Nothing was charged.',
        }).then(() => {}, () => {});
        return new Response(JSON.stringify({ received: true, triggered: 'fee_auth_session_expired' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (eventType === 'account.updated') {
    const account = event.data?.object as StripeAccount | undefined;
    return handleAccountUpdated(supabase, account ?? {});
  }

  // Plan subscriptions cancelled from the Stripe dashboard or by the
  // customer — keeps household_plan_subscriptions honest. Requires the
  // event to be enabled on the webhook endpoint in Stripe; if it isn't,
  // nothing breaks — the table just stays admin-managed.
  if (eventType === 'customer.subscription.deleted') {
    const sub = event.data?.object as StripeSubscription | undefined;
    // A helper's €2/month ✓ Verified plan ending (cancelled, or payments
    // failed until Stripe gave up) — turn the tick's paid leg off. Matched
    // by the stored subscription id, with the sub's own metadata as the
    // fallback for rows where the redirect confirm never stored it.
    if (sub?.id) {
      const helperIdMeta = sub.metadata?.type === 'verified_plan' ? sub.metadata?.helper_id : undefined;
      const { data: flipped, error: tickErr } = await supabase
        .from('household_helpers')
        .update({ verified_plan_active: false, verified_plan_sub_id: null })
        .or(`verified_plan_sub_id.eq.${sub.id}${helperIdMeta ? `,id.eq.${helperIdMeta}` : ''}`)
        .eq('verified_plan_active', true)
        .select('id')
        .maybeSingle();
      if (tickErr) console.warn('[stripe-webhook] verified_plan deactivate failed', tickErr);
      if (flipped) {
        return new Response(JSON.stringify({ received: true, verified_plan: 'ended' }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    return handlePlanSubscriptionDeleted(supabase, sub ?? {});
  }

  // charge.refunded covers out-of-band refunds (Stripe dashboard
  // action, chargeback) so the vano_payments row stays in sync with
  // Stripe's reality. In-app refunds via refund-vano-payment already
  // flip the row before the webhook lands; the handler is idempotent
  // so a replay is a no-op.
  if (eventType === 'charge.refunded') {
    const charge = event.data?.object as StripeCharge | undefined;
    return handleChargeRefunded(supabase, charge ?? {});
  }

  // Any other event type: 200 + move on. We only subscribe to the
  // ones above in the Stripe Dashboard, but a future subscription
  // change shouldn't flood Stripe with retries.
  return new Response(JSON.stringify({ received: true, ignored: eventType }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
