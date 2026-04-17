import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe webhook endpoint. verify_jwt is disabled for this function
// (Stripe can't send JWTs); authenticity is proven by verifying the
// Stripe-Signature header against STRIPE_WEBHOOK_SECRET using HMAC-SHA256.
//
// Dispatches three event types:
//   1. checkout.session.completed with metadata.ai_find_request_id →
//      marks ai_find_requests as paid and kicks off AI scouting.
//   2. checkout.session.completed with metadata.vano_payment_id →
//      marks vano_payments as paid (Stripe has already transferred
//      funds to the freelancer; no further action needed).
//   3. account.updated → flips student_profiles.stripe_payouts_enabled
//      when the freelancer's Connect Express account is ready to
//      receive transfers.
//
// All handlers are idempotent on replay.

const TOLERANCE_SECONDS = 300;

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
  const { data: flipped, error: flipError } = await supabase
    .from('ai_find_requests')
    .update({
      status: 'paid',
      stripe_payment_status: session.payment_status ?? 'paid',
      stripe_payment_intent_id: session.payment_intent ?? null,
      paid_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('stripe_session_id', session.id)
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

  const triggerPromise = fetch(`${supabaseUrl}/functions/v1/ai-find-freelancer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request_id: requestId }),
  }).catch((err) => console.error('[stripe-webhook] ai-find trigger failed', err));

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(triggerPromise);

  return new Response(JSON.stringify({ received: true, triggered: 'ai_find' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// --- Handler: Vano Pay checkout completed ---------------------------------
// Stripe Checkout with destination charges has already split the funds
// between the platform (application_fee_amount) and the freelancer
// (transfer_data.destination) by the time this fires. Our job is just
// to stamp the row so the UI can reflect "Paid".
async function handleVanoPayCheckoutCompleted(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  paymentId: string,
): Promise<Response> {
  const { data: flipped, error: flipError } = await supabase
    .from('vano_payments')
    .update({
      status: 'transferred',
      stripe_payment_intent_id: session.payment_intent ?? null,
      paid_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .eq('id', paymentId)
    .eq('stripe_session_id', session.id)
    .eq('status', 'awaiting_payment')
    .select('id')
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

  return new Response(JSON.stringify({ received: true, triggered: 'vano_pay' }), {
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

  // Any other event type: 200 + move on. We only subscribe to the
  // ones above in the Stripe Dashboard, but a future subscription
  // change shouldn't flood Stripe with retries.
  return new Response(JSON.stringify({ received: true, ignored: eventType }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
