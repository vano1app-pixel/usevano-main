import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderHouseholdEmail, emailBox, emailButton, emailP, escapeHtml,
  categoryLabel, greetName, sendHouseholdEmail, BRAND,
} from "../_shared/householdEmail.ts";

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
        const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
        const trackUrl = `${siteUrl}/track/${bookingId}`;
        const name = greetName((updated as { customer_name?: string }).customer_name);
        const catLabel = categoryLabel((updated as { category?: string }).category);
        const payUrl = (updated as { stripe_checkout_url?: string | null }).stripe_checkout_url;
        const isPaid = !!(updated as { paid_at?: string | null }).paid_at;
        const hasPayStep = !!payUrl && !isPaid;

        const payBlock = hasPayStep ? emailBox(`
          <p style="margin:0 0 4px;color:${BRAND.ink};font-size:15px;font-weight:700;">Your helper is confirmed — payment pending</p>
          <p style="margin:0 0 14px;color:${BRAND.muted};font-size:13px;line-height:1.5;">Pay securely by card to lock in your booking.</p>
          ${emailButton({ label: 'Confirm &amp; pay →', url: payUrl! })}`) : '';

        await sendHouseholdEmail({
          to: email,
          subject: `You're on the list — VANO ${catLabel} updates`,
          html: renderHouseholdEmail({
            preheader: hasPayStep
              ? 'Your helper is confirmed — one quick payment locks them in.'
              : `Every update on your ${catLabel} lands here from now on.`,
            eyebrow: 'Email updates',
            heading: 'Email updates on ✓',
            bodyHtml: [
              emailP(`Hi ${escapeHtml(name)},`),
              emailP(`You'll now get every update for your <strong>${escapeHtml(catLabel)}</strong> by email — helper confirmation, payment link and receipt.`, { last: true }),
              payBlock,
            ].join(''),
            ctas: [{ label: 'Track your booking →', url: trackUrl, variant: hasPayStep ? 'quiet' : 'primary' }],
            footerNote: `Ref: ${bookingId.slice(-8).toUpperCase()}`,
          }),
          text: `Hi ${name}, you'll now get every update for your ${catLabel} by email.${hasPayStep ? ` Your helper is confirmed — pay securely here: ${payUrl}.` : ''} Track: ${trackUrl}`,
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
