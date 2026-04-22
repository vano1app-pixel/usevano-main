import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// 10 minutes — Stripe's baseline is 5 min, but we've seen legitimate
// webhooks dropped under NTP jitter on the Supabase edge region. 10 min
// is the widely-used safe margin; still short enough that a replayed
// request from an attacker who captured a signature gets rejected.
const TOLERANCE_SECONDS = 600;
// How long we hold funds before the cron auto-releases them. 14 days
// gives the hirer time to receive and review the work; long enough to
// matter as protection, short enough that freelancers aren't left
// waiting forever when the hirer ghosts.
const AUTO_RELEASE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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
  // no recovery path. We catch those cases and flip the row to
  // failed + auto-refund inline — same safety net the function
  // itself runs on its own crashes, just one level up so a function
  // that never ran still honours the "€1 refunded if no match" promise.
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
        await refundStuckAiFindRequest(
          supabase,
          requestId,
          session.payment_intent ?? null,
          `ai_find_trigger_http_${resp.status}`,
        );
      }
    } catch (err) {
      console.error('[stripe-webhook] ai-find trigger threw', err);
      await refundStuckAiFindRequest(
        supabase,
        requestId,
        session.payment_intent ?? null,
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
// reached at all. Flips the row to refunded (if Stripe refund lands)
// or failed (with 'manual refund required' note) so the hirer never
// sees a stranded "paid but nothing happening" state. Idempotent on
// the row status so a Stripe webhook retry that lands after we've
// already handled the row is a no-op.
async function refundStuckAiFindRequest(
  supabase: SupabaseClient,
  requestId: string,
  paymentIntentId: string | null,
  reason: string,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('ai_find_requests')
      .select('status')
      .eq('id', requestId)
      .maybeSingle();
    const status = (existing?.status as string | undefined) ?? null;
    // Already resolved (complete/refunded/failed) — leave alone.
    if (!status || status === 'complete' || status === 'refunded' || status === 'failed') {
      return;
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? null;
    let refunded = false;
    if (paymentIntentId && stripeKey) {
      try {
        const resp = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            // Idempotent on the payment intent so a retry doesn't
            // double-refund. Stripe returns the existing refund id.
            'Idempotency-Key': `ai_find_auto_refund_${requestId}`,
          },
          body: `payment_intent=${encodeURIComponent(paymentIntentId)}`,
        });
        refunded = resp.ok;
        if (!resp.ok) {
          console.error('[stripe-webhook] ai-find auto-refund failed', resp.status);
        }
      } catch (err) {
        console.error('[stripe-webhook] ai-find auto-refund threw', err);
      }
    }

    await supabase
      .from('ai_find_requests')
      .update({
        status: refunded ? 'refunded' : 'failed',
        error_message: refunded
          ? reason.slice(0, 500)
          : `${reason.slice(0, 450)} (manual refund required)`,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);
  } catch (err) {
    console.error('[stripe-webhook] refundStuckAiFindRequest errored', err);
  }
}

// --- Handler: Vano Pay checkout completed ---------------------------------
// Under escrow, this flips the row to 'paid' (HELD on the platform)
// and stamps auto_release_at = now + 14 days. release-vano-payment
// (or the auto-release cron) handles the actual transfer to the
// freelancer when the hirer releases or the window expires.
async function handleVanoPayCheckoutCompleted(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  paymentId: string,
): Promise<Response> {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const autoReleaseIso = new Date(nowMs + AUTO_RELEASE_WINDOW_MS).toISOString();

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
  metadata?: Record<string, string | undefined>;
};

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

  const nowIso = new Date().toISOString();
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

    if (aiFindId) {
      return handleAiFindCheckoutCompleted(supabase, supabaseUrl, serviceKey, session, aiFindId);
    }
    if (vanoPayId) {
      return handleVanoPayCheckoutCompleted(supabase, session, vanoPayId);
    }

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

  if (eventType === 'account.updated') {
    const account = event.data?.object as StripeAccount | undefined;
    return handleAccountUpdated(supabase, account ?? {});
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
