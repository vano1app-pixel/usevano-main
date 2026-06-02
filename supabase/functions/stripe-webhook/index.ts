import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeAutoReleaseMs } from "../_shared/vanoPayConfig.ts";

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
  customer_details?: { email?: string | null; name?: string | null };
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

// --- Handler: household checkout.session.completed -----------------------
// Fires when a customer pays for a household booking. Flips the booking
// from awaiting_payment → pending so it appears in the student job feed.
// Also stamps the real Stripe PaymentIntent id (needed for capture).
// Fire-and-forget confirmation email sent to the customer via Resend.
async function handleHouseholdCheckoutCompleted(
  supabase: SupabaseClient,
  session: StripeCheckoutSession,
  bookingId: string,
): Promise<Response> {
  const customerEmail = session.customer_details?.email ?? null;

  const { data: flipped, error } = await supabase
    .from('household_bookings')
    .update({
      status: 'pending',
      stripe_payment_intent_id: session.payment_intent ?? null,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
    })
    .eq('id', bookingId)
    .eq('status', 'awaiting_payment')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, city, price_cents')
    .maybeSingle();

  if (error) {
    console.error('[stripe-webhook] household booking flip failed', error);
    return new Response('DB error', { status: 500 });
  }
  if (!flipped) {
    return new Response(JSON.stringify({ received: true, replay: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
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
      const name = (flipped as { customer_name?: string }).customer_name || 'there';
      const category = (flipped as { category?: string }).category || 'your job';
      const when = (flipped as { scheduled_date?: string }).scheduled_date || '';

      const categoryLabels: Record<string, string> = {
        shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
        moving: 'Moving help', cleaning: 'Cleaning', other: 'General help',
      };
      const categoryLabel = categoryLabels[category] ?? category;

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Booking confirmed ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${categoryLabel}</strong>${when ? ' for ' + when : ''} is confirmed. We're finding you a helper now — usually within the hour.</p>
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

  // Notify admin via email — fire and forget
  const adminNotifyPromise = (async () => {
    try {
      const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
      if (!resendKey) return;
      const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
      const b = flipped as {
        customer_name?: string; customer_email?: string; customer_phone?: string;
        category?: string; scheduled_date?: string; city?: string; price_cents?: number;
      };
      const categoryLabels: Record<string, string> = {
        shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
        moving: 'Moving help', cleaning: 'Cleaning', other: 'General help',
      };
      const cat = categoryLabels[b.category ?? ''] ?? b.category ?? 'Job';
      const priceStr = b.price_cents ? `€${(b.price_cents / 100).toFixed(2)}` : '?';
      const ref = bookingId.slice(-8).toUpperCase();

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

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(emailPromise);
    runtime.waitUntil(adminNotifyPromise);
  }

  return new Response(
    JSON.stringify({ received: true, triggered: 'household_booking', state: 'pending' }),
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
    const householdBookingId = session.metadata?.household_booking_id;

    if (aiFindId) {
      return handleAiFindCheckoutCompleted(supabase, supabaseUrl, serviceKey, session, aiFindId);
    }
    if (vanoPayId) {
      return handleVanoPayCheckoutCompleted(supabase, session, vanoPayId);
    }
    if (householdBookingId) {
      return handleHouseholdCheckoutCompleted(supabase, session, householdBookingId);
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
