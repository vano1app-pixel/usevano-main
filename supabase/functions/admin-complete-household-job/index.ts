import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Admin endpoint to mark a household job complete.
//
// Called from the /admin dashboard when an operator completes a job.
//
// Pay-after-accept notes: payments are taken with automatic capture when the
// customer pays the post-acceptance link, so there is normally nothing to
// capture here. A capture is only attempted for legacy manual-capture
// PaymentIntents (pi_ id present but paid_at empty), and "already captured"
// style errors are tolerated. An UNPAID booking can still be completed —
// the student did the work and their payout must be recorded either way;
// the admin UI shows the UNPAID chip so the operator can chase payment.
//
// Guards:
//   1. Valid Supabase JWT required.
//   2. Caller must have the 'admin' role in user_roles.
//   3. Booking must be in an active state (pending → in_progress).
//
// On success:
//   - household_bookings status → 'completed'.
//   - household_job_updates row inserted.
//   - household_payouts row inserted (if a student is assigned).
//   - Customer gets a "job done — rate your helper" email (if email known).
//   - Student gets a "you earned €X" email.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const CAPTURABLE_STATUSES = ['pending', 'accepted', 'on_way', 'arrived', 'in_progress'];
const PLATFORM_FEE_BPS = 500; // 5%

// ── SMS via Twilio (no-op when not configured) ─────────────────────────────
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
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

async function sendSms(to: string | null | undefined, body: string): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const from  = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!sid || !token || !from || from.startsWith('whatsapp:')) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
    });
    if (!resp.ok) console.warn('[sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
    else console.log(`[sms] sent to ${e164}`);
    return resp.ok;
  } catch (e) {
    console.warn('[sms] twilio exception', e);
    return false;
  }
}

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the JWT and get the caller's user id
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const callerId = claimsData.claims.sub as string;

    // Check admin role via service-role client (bypasses RLS on user_roles)
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', callerId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleRow) return bad(403, 'Admin access required');

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id.trim() : null;
    if (!bookingId) return bad(400, 'booking_id required');

    // Fetch the booking
    const { data: booking, error: fetchError } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, stripe_payment_intent_id, price_estimate_cents, paid_at, customer_name, customer_email, customer_phone, category, city, scheduled_date')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !booking) return bad(404, 'Booking not found');

    if (!CAPTURABLE_STATUSES.includes(booking.status)) {
      return bad(409, `Cannot complete booking in status: ${booking.status}`);
    }

    // Legacy safety net: manual-capture PaymentIntents from the pay-first era
    // still need an explicit capture. Current payments use automatic capture
    // (paid_at is stamped by the webhook), so this is normally skipped.
    const piId = booking.stripe_payment_intent_id as string | null;
    if (piId?.startsWith('pi_') && !booking.paid_at) {
      const captureResp = await fetch(
        `https://api.stripe.com/v1/payment_intents/${piId}/capture`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
      if (!captureResp.ok) {
        const text = await captureResp.text();
        // Already-captured / already-succeeded responses are fine (idempotent);
        // anything else is logged but does NOT block completion — the student
        // did the work and the payout must be recorded regardless.
        if (text.includes('already_captured') || text.includes('succeeded')) {
          await supabase.from('household_bookings').update({ paid_at: new Date().toISOString() }).eq('id', bookingId);
        } else {
          console.error('[admin-complete] stripe capture error (non-blocking)', captureResp.status, text.slice(0, 300));
        }
      } else {
        await supabase.from('household_bookings').update({ paid_at: new Date().toISOString() }).eq('id', bookingId);
      }
    }

    // Mark booking completed
    const { error: updateError } = await supabase
      .from('household_bookings')
      .update({ status: 'completed' })
      .eq('id', bookingId);

    if (updateError) {
      console.error('[admin-complete] booking update failed', updateError);
      return bad(500, 'Booking update failed. Contact support with booking ID.');
    }

    // Audit trail
    await supabase.from('household_job_updates').insert({
      booking_id: bookingId,
      status: 'completed',
      note: `Completed by admin (${callerId.slice(0, 8)}).`,
    });

    // Payout row — only if a student is assigned
    let studentEarnsCents: number | null = null;
    if (booking.student_id) {
      const priceCents = booking.price_estimate_cents ?? 0;
      studentEarnsCents = Math.floor(priceCents * (10000 - PLATFORM_FEE_BPS) / 10000);
      await supabase.from('household_payouts').insert({
        booking_id: bookingId,
        student_id: booking.student_id,
        amount_cents: studentEarnsCents,
        status: 'pending',
      });
    }

    // ── Completion emails — fire and forget ────────────────────────────────
    const emailsPromise = (async () => {
      const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
      if (!resendKey) return;
      const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
      const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
      const trackUrl = `${siteUrl}/track/${bookingId}`;
      const catLabels: Record<string, string> = {
        shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
        moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
        handyman: 'Handyman', plumbing: 'Plumbing help',
        'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
        'wait-delivery': 'Wait for delivery', other: 'General help',
      };
      const catLabel = catLabels[(booking.category as string) ?? ''] ?? (booking.category as string) ?? 'job';

      // Helper name + email for both messages
      let helperFirst = 'your helper';
      let helperEmail: string | null = null;
      if (booking.student_id) {
        const { data: helper } = await supabase
          .from('household_helpers')
          .select('name, email')
          .eq('user_id', booking.student_id)
          .maybeSingle() as { data: { name?: string; email?: string } | null };
        if (helper?.name) helperFirst = helper.name.split(' ')[0];
        helperEmail = helper?.email ?? null;
      }

      // Customer SMS: done + rate + rebook nudge (works even with no email)
      await sendSms(
        booking.customer_phone as string | null,
        `VANO: Your ${catLabel} is done ✓ How did ${helperFirst} do? Rate in one tap: ${trackUrl}?rate=5 — Every 3rd booking is 50% off!`,
      );

      // Customer: job done + one-tap star rating (deep links to track?rate=N)
      const custEmail = booking.customer_email as string | null;
      if (custEmail) {
        const stars = [1, 2, 3, 4, 5].map((n) =>
          `<a href="${trackUrl}?rate=${n}" style="text-decoration:none;font-size:30px;line-height:1;color:#f5b301;padding:0 3px;">&#9733;</a>`,
        ).join('');
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [custEmail],
            subject: `Job done ✓ — how did ${helperFirst} do?`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">All done ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${booking.customer_name ?? 'there'},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${catLabel}</strong> is complete. Quick one — how did <strong>${helperFirst}</strong> do? One tap is all it takes:</p>
    <div style="text-align:center;margin:0 0 24px;">${stars}</div>
    <p style="margin:0 0 8px;color:#374151;font-size:14px;line-height:1.6;">Need anything else done? Every 3rd booking is <strong>50% off</strong>.</p>
    <a href="${siteUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Book again →</a>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">Ref: ${bookingId.slice(-8).toUpperCase()}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${booking.customer_name ?? 'there'}, your ${catLabel} is complete! How did ${helperFirst} do? Rate them in one tap: ${trackUrl}?rate=5 — and remember, every 3rd booking is 50% off: ${siteUrl}`,
          }),
        }).catch(() => {});
      }

      // Student: you earned €X
      if (helperEmail && studentEarnsCents) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [helperEmail],
            subject: `You earned €${(studentEarnsCents / 100).toFixed(2)} 🎉`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">€${(studentEarnsCents / 100).toFixed(2)} earned 🎉</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${helperFirst}!</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">Nice work on the <strong>${catLabel}</strong> — you keep <strong>€${(studentEarnsCents / 100).toFixed(2)}</strong> (95% of the job). Your Revolut payout is on the way.</p>
    <a href="${siteUrl}/student-dashboard" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">See your earnings →</a>
  </div>
</div>
</body></html>`,
            text: `Hi ${helperFirst}! Nice work on the ${catLabel} — you keep €${(studentEarnsCents / 100).toFixed(2)} (95% of the job). Revolut payout on the way. Earnings: ${siteUrl}/student-dashboard`,
          }),
        }).catch(() => {});
      }
    })();

    const runtime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(emailsPromise);
    else emailsPromise.catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        booking_id: bookingId,
        student_earns_cents: studentEarnsCents,
        paid: !!booking.paid_at || !!piId?.startsWith('pi_'),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[admin-complete] unhandled error', err);
    return bad(500, 'Unexpected error');
  }
});
