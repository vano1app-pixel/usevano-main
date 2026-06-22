import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe Identity webhook. verify_jwt must be disabled for this function
// (Stripe can't send JWTs); authenticity is proven by verifying the
// Stripe-Signature header against the webhook secret using HMAC-SHA256
// (same scheme as stripe-webhook).
//
// Handles:
//   identity.verification_session.verified        → id_verified = true
//   identity.verification_session.requires_input  → identity_status = 'requires_input'
//   identity.verification_session.canceled        → identity_status = 'canceled'
//
// Matches the helper by metadata.helper_id (set at session creation), falling
// back to the stored identity_session_id. Idempotent on replay.

const TOLERANCE_SECONDS = 300;

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, secret: string): Promise<boolean> {
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
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${rawBody}`));
  const expected = hex(mac);
  return candidateSigs.some((s) => constantTimeEqual(s, expected));
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('STRIPE_IDENTITY_WEBHOOK_SECRET')?.trim() || Deno.env.get('STRIPE_WEBHOOK_SECRET')?.trim();
  if (!secret) { console.error('[stripe-identity-webhook] no webhook secret set'); return new Response('Not configured', { status: 503 }); }

  const sig = req.headers.get('Stripe-Signature');
  const rawBody = await req.text();
  if (!sig || !(await verifyStripeSignature(rawBody, sig, secret))) {
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: { id?: string; metadata?: { helper_id?: string } } };
    };
    const type = event.type ?? '';
    const obj = event.data?.object;
    if (!type.startsWith('identity.verification_session.') || !obj) {
      return new Response(JSON.stringify({ received: true, ignored: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const sessionId = obj.id ?? null;
    let helperId = obj.metadata?.helper_id ?? null;
    if (!helperId && sessionId) {
      const { data } = await supabase.from('household_helpers').select('id').eq('identity_session_id', sessionId).maybeSingle();
      helperId = (data as { id?: string } | null)?.id ?? null;
    }
    if (!helperId) {
      return new Response(JSON.stringify({ received: true, unmatched: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    const status =
      type === 'identity.verification_session.verified' ? 'verified'
      : type === 'identity.verification_session.requires_input' ? 'requires_input'
      : type === 'identity.verification_session.canceled' ? 'canceled'
      : 'processing';

    const update: Record<string, unknown> = { identity_status: status };
    if (status === 'verified') update.id_verified = true;
    const { error } = await supabase.from('household_helpers').update(update).eq('id', helperId);
    if (error) console.error('[stripe-identity-webhook] update failed', error);

    // Auto-approve once the ID check passes — but only a still-pending
    // application, so a verified ID never revives a suspended/rejected helper
    // or re-touches one that's already approved. This removes the manual
    // approval step: passing verification = live.
    if (status === 'verified') {
      const { data: approved } = await supabase
        .from('household_helpers')
        .update({ status: 'approved' })
        .eq('id', helperId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if ((approved as { id?: string } | null)?.id) {
        fetch(`${supabaseUrl}/functions/v1/notify-helper-approved`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ helper_id: helperId }),
        }).catch(() => {/* non-critical — the status flip is what matters */});
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[stripe-identity-webhook] unhandled', err);
    return new Response('Error', { status: 500 });
  }
});
