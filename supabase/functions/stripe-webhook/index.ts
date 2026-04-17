import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe webhook endpoint. verify_jwt is disabled for this function
// (Stripe can't send JWTs); authenticity is proven by verifying the
// Stripe-Signature header against STRIPE_WEBHOOK_SECRET using HMAC-SHA256.
//
// Only `checkout.session.completed` is handled right now. Idempotent
// on replay: the "flip awaiting_payment → paid" update is guarded by a
// WHERE clause so duplicate events don't re-trigger the AI find.

const TOLERANCE_SECONDS = 300; // Stripe's recommended window.

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
  // Stripe-Signature looks like "t=1234567890,v1=hex,v1=hex".
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

  // We only care about the one event right now. Acknowledge others
  // with 200 so Stripe doesn't retry — they're legitimate, just
  // ignored.
  if (event.type !== 'checkout.session.completed') {
    return new Response(JSON.stringify({ received: true, ignored: event.type }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const session = event.data?.object as {
    id?: string;
    payment_status?: string;
    payment_intent?: string;
    client_reference_id?: string;
    metadata?: Record<string, string | undefined>;
  } | undefined;

  const sessionId = session?.id;
  const requestId = session?.metadata?.ai_find_request_id || session?.client_reference_id;

  if (!sessionId || !requestId) {
    console.error('[stripe-webhook] missing session id or request id', { sessionId, requestId });
    return new Response('Missing identifiers', { status: 400 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Idempotent flip: only proceed when the row is still awaiting_payment.
  // A second delivery of the same event will update zero rows and the
  // downstream AI find will not be re-triggered.
  const { data: flipped, error: flipError } = await supabase
    .from('ai_find_requests')
    .update({
      status: 'paid',
      stripe_payment_status: session?.payment_status ?? 'paid',
      stripe_payment_intent_id: session?.payment_intent ?? null,
      paid_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('stripe_session_id', sessionId)
    .eq('status', 'awaiting_payment')
    .select('id')
    .maybeSingle();

  if (flipError) {
    console.error('[stripe-webhook] flip failed', flipError);
    // 500 so Stripe retries. Transient DB errors shouldn't lose the payment.
    return new Response('DB error', { status: 500 });
  }

  // No-op on replay. Still ack 200 — this is by design.
  if (!flipped) {
    return new Response(JSON.stringify({ received: true, replay: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Kick off the AI find. We intentionally do NOT await — ai-find can
  // take 10-30s and Stripe expects a webhook response within 10. Fire
  // it off; the edge runtime will keep the request alive long enough.
  const aiFindUrl = `${supabaseUrl}/functions/v1/ai-find-freelancer`;
  const triggerPromise = fetch(aiFindUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request_id: requestId }),
  }).catch((err) => console.error('[stripe-webhook] ai-find trigger failed', err));

  // Supabase edge runtime exposes waitUntil for background work; if
  // present, use it so the kickoff isn't cut short.
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(triggerPromise);
  }

  return new Response(JSON.stringify({ received: true, triggered: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
