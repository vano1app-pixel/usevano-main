import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Inlined CORS ──────────────────────────────────────────────────────────────
const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return FALLBACK_ORIGINS;
  return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
}
function allowsVercelPreview(origin: string): boolean {
  try { return new URL(origin).hostname.endsWith('-vano1app-pixels-projects.vercel.app'); } catch { return false; }
}
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  if (getAllowlist().includes(n)) return n;
  if (allowsVercelPreview(n)) return n;
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
function isOriginAllowed(req: Request): boolean {
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}
// ─────────────────────────────────────────────────────────────────────────────

// Quick-book collects only a phone number, so most bookings start with no
// email — meaning no confirmation, no pay-link email, no receipt. The track
// page offers an opt-in; this function attaches the email and sends the
// "you're on the list" confirmation. The booking UUID is the capability:
// only the customer (and their helper) ever hold the track link.
//
// Write-once: an email can only be attached while customer_email IS NULL,
// so a leaked link can't be used to swap notifications to an attacker.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', other: 'General help',
};

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body.booking_id === 'string' ? body.booking_id.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!UUID_RE.test(bookingId)) return bad(400, 'Invalid booking id');
    if (!EMAIL_RE.test(email) || email.length > 254) return bad(400, 'Please enter a valid email');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Write-once update — only succeeds while no email is attached yet.
    const { data: updated, error: updErr } = await supabase
      .from('household_bookings')
      .update({ customer_email: email })
      .eq('id', bookingId)
      .is('customer_email', null)
      .select('id, customer_name, category, scheduled_date, paid_at, stripe_checkout_url')
      .maybeSingle();

    if (updErr) {
      console.error('[set-booking-email] update failed', updErr);
      return bad(500, 'Could not save your email. Please try again.');
    }
    if (!updated) {
      // Either the booking doesn't exist or it already has an email.
      const { data: existing } = await supabase
        .from('household_bookings')
        .select('id, customer_email')
        .eq('id', bookingId)
        .maybeSingle();
      if (!existing) return bad(404, 'Booking not found');
      return bad(409, 'This booking already has an email attached');
    }

    // Confirmation email — fire and forget so a Resend hiccup never blocks
    // the opt-in itself.
    const emailPromise = (async () => {
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
        if (!resendKey) return;
        const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
        const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
        const trackUrl = `${siteUrl}/track/${bookingId}`;
        const name = (updated as { customer_name?: string }).customer_name || 'there';
        const catLabel = CATEGORY_LABELS[(updated as { category?: string }).category ?? ''] ?? 'booking';
        const payUrl = (updated as { stripe_checkout_url?: string | null }).stripe_checkout_url;
        const isPaid = !!(updated as { paid_at?: string | null }).paid_at;

        const payBlock = payUrl && !isPaid ? `
    <div style="background:#f6f8f6;border:1px solid #d5e2d8;border-radius:14px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 4px;color:#111827;font-size:15px;font-weight:700;">Your helper is confirmed — payment pending</p>
      <p style="margin:0 0 14px;color:#4b5563;font-size:13px;line-height:1.5;">Pay securely by card to lock in your booking.</p>
      <a href="${payUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;">Confirm &amp; pay →</a>
    </div>` : '';

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [email],
            subject: `You're on the list — VANO ${catLabel} updates`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Email updates on ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${name},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">You'll now get every update for your <strong>${catLabel}</strong> by email — helper confirmation, payment link and receipt.</p>
    ${payBlock}
    <a href="${trackUrl}" style="display:inline-block;background:${payBlock ? '#f3f4f6' : '#4a7c59'};color:${payBlock ? '#374151' : '#fff'};font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;${payBlock ? 'border:1px solid #e5e7eb;' : ''}">Track your booking →</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Ref: ${bookingId.slice(-8).toUpperCase()}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${name}, you'll now get every update for your ${catLabel} by email.${payUrl && !isPaid ? ` Your helper is confirmed — pay securely here: ${payUrl}.` : ''} Track: ${trackUrl}`,
          }),
        });
      } catch (e) {
        console.warn('[set-booking-email] confirmation email error', e);
      }
    })();

    const runtime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(emailPromise);
    else emailPromise.catch(() => {});

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[set-booking-email] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
