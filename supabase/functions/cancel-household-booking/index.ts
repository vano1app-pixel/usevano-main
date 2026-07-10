import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Three cancellation modes:
//
// type=customer_cancel  — no auth; booking must be 'pending'. Stripe refund + cancel.
// type=helper_release   — auth required (must be the assigned student); releases
//                         job back to 'pending' for re-dispatch, notifies customer.
// type=admin_cancel     — auth required (vano1app@gmail.com); cancels any non-final
//                         booking, issues Stripe refund where possible.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
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

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceKey     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const STRIPE_SECRET  = Deno.env.get('STRIPE_SECRET_KEY');
    const resendKey      = Deno.env.get('RESEND_API_KEY')?.trim();
    const from           = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const adminEmail     = Deno.env.get('ADMIN_EMAIL')?.trim();
    const siteUrl        = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

    const body = await req.json().catch(() => ({}));
    const { booking_id, type } = body;

    if (!booking_id) return bad(400, 'booking_id required');
    if (!['customer_cancel', 'helper_release', 'admin_cancel'].includes(type)) {
      return bad(400, 'Invalid type');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, status, student_id, stripe_payment_intent_id, price_estimate_cents, customer_name, customer_email, category, city, scheduled_date, paid_at')
      .eq('id', booking_id)
      .maybeSingle();

    if (fetchErr || !booking) return bad(404, 'Booking not found');

    const b = booking as Record<string, unknown>;
    const FINAL = ['completed', 'cancelled'];
    if (FINAL.includes(b.status as string)) {
      return bad(409, `Cannot modify a ${b.status} booking`);
    }

    const ref       = booking_id.slice(-8).toUpperCase();
    const custName  = String(b.customer_name ?? 'there');
    const custEmail = b.customer_email as string | null;
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? 'job';

    // Helper: issue a Stripe refund. Returns true on success.
    async function stripeRefund(): Promise<boolean> {
      const piId = b.stripe_payment_intent_id as string | null;
      if (!STRIPE_SECRET || !piId?.startsWith('pi_')) return false;
      const resp = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formEncode({ payment_intent: piId }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('[cancel-household-booking] stripe refund failed', resp.status, txt.slice(0, 200));
        return false;
      }
      return true;
    }

    // Helper: kill the open checkout session so a stale pay link can't be paid
    // after cancellation (an unpaid booking stores its cs_… id in
    // stripe_payment_intent_id). Best-effort; never blocks the cancel.
    function expireCheckoutSession(): void {
      const sessId = b.stripe_payment_intent_id as string | null;
      if (!STRIPE_SECRET || !sessId?.startsWith('cs_')) return;
      void fetch(`https://api.stripe.com/v1/checkout/sessions/${sessId}/expire`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
      }).catch(() => {});
    }

    // ── customer_cancel ─────────────────────────────────────────────────────
    if (type === 'customer_cancel') {
      // Self-serve cancel is allowed right up until the helper starts the job.
      // Once it's in_progress/completed the helper is already working — those
      // route to the manual "message us" path.
      const CANCELLABLE = ['pending', 'accepted', 'on_way', 'arrived'];
      if (!CANCELLABLE.includes(b.status as string)) {
        return bad(409, 'Your helper has already started — message us to sort out a cancellation.');
      }

      const isPaid = !!b.paid_at;
      const hasRealIntent = (b.stripe_payment_intent_id as string | null)?.startsWith('pi_') ?? false;

      // If paid via a real payment intent, refund first — only cancel on success.
      // Unpaid bookings (no paid_at, or only a checkout session id) cancel directly.
      let refundOk = false;
      if (isPaid && hasRealIntent) {
        refundOk = await stripeRefund();
        if (!refundOk) {
          return bad(502, "We couldn't process your refund automatically. Please contact us on WhatsApp: +353 89 981 7111");
        }
      }

      await supabase.from('household_bookings').update({ status: 'cancelled' }).eq('id', booking_id);
      await supabase.from('household_job_updates').insert({ booking_id, status: 'cancelled', note: 'Customer cancelled.' });
      // Kill the pay link so it can't be paid against this cancelled booking.
      expireCheckoutSession();

      // If a helper was assigned, notify them so their live-subscribed screen
      // and pocket are updated. 'cancelled' isn't a valid push status, so this
      // is the job_update above (drives the realtime subscription) plus a
      // best-effort email/SMS via household_helpers. Never blocks the cancel.
      const assignedId = b.student_id as string | null;
      if (assignedId) {
        const { data: helperRow } = await supabase
          .from('household_helpers')
          .select('name, email, phone')
          .eq('user_id', assignedId)
          .maybeSingle() as { data: { name?: string; email?: string | null; phone?: string | null } | null };
        const helperFirst = helperRow?.name ? helperRow.name.split(' ')[0] : 'there';
        if (resendKey && helperRow?.email) {
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from, to: [helperRow.email],
              subject: `Booking cancelled — ${catLabel} (${ref})`,
              text: `Hi ${helperFirst}, the ${catLabel} you were assigned has been cancelled by the customer, so you're no longer needed for it. More jobs are waiting: ${siteUrl}/student-dashboard`,
            }),
          }).catch(() => {});
        }
      }

      if (resendKey && custEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [custEmail],
            subject: 'Your VANO booking has been cancelled',
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#374151;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Booking cancelled</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${catLabel}</strong> booking has been cancelled.${refundOk ? ' A full refund has been issued and should appear on your card within 5–7 business days.' : ' You weren\'t charged.'}</p>
    <p style="margin:0 0 0;color:#374151;font-size:15px;">Questions? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${custName}, your VANO ${catLabel} (${ref}) has been cancelled.${refundOk ? ' Full refund issued (5–7 days).' : " You weren't charged."} Questions? WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {});
      }

      if (resendKey && adminEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [adminEmail],
            subject: `❌ Customer cancelled — ${ref}`,
            text: `Customer cancelled booking ${ref}.\nJob: ${catLabel}\nCustomer: ${custName} (${custEmail ?? '—'})\nRefund: ${refundOk ? 'Issued' : 'None (no PI)'}\nID: ${booking_id}`,
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true, refunded: refundOk }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── helper_release ───────────────────────────────────────────────────────
    if (type === 'helper_release') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await authClient.auth.getUser();
      if (userErr || !user) return bad(401, 'Unauthorized');
      if (b.student_id !== user.id) return bad(403, 'Not the assigned helper');

      const releasable = ['accepted', 'on_way', 'arrived', 'in_progress'];
      if (!releasable.includes(b.status as string)) {
        return bad(409, `Cannot release a job in status: ${b.status}`);
      }

      await supabase.from('household_bookings').update({
        status: 'pending',
        student_id: null,
        accepted_at: null,
        worker_lat: null,
        worker_lng: null,
        worker_location_updated_at: null,
        // Reset the pay-after-accept state along with the helper: the old
        // checkout URL kept the track page showing "Helper confirmed — pay
        // now" while we were actually searching again, and the stale
        // payment_requested_at meant remind-unpaid-bookings' 2h clock could
        // release the REPLACEMENT helper minutes after they accepted. A new
        // accept generates a fresh session + fresh clock.
        payment_requested_at: null,
        stripe_checkout_url: null,
        payment_reminder_sent_at: null,
        // Clear the stall-sweep stamps too. Without this, a stall PING fired at
        // the ORIGINAL helper (stalled_reminded_at set) survives the release, so
        // sweep-stalled-jobs Stage B would strip the REPLACEMENT helper off the
        // job minutes after they accept — the job is handed to a fresh dispatch
        // cycle, so its stall clock must restart from zero.
        stalled_reminded_at: null,
        stalled_released_at: null,
        stalled_escalated_at: null,
      }).eq('id', booking_id);

      await supabase.from('household_job_updates').insert({
        booking_id,
        status: 'cancelled',
        note: 'Helper released the job. Finding another helper.',
      });

      let helperFirst = 'Your helper';
      const { data: helperRow } = await supabase
        .from('household_helpers')
        .select('name')
        .eq('user_id', user.id)
        .maybeSingle() as { data: { name?: string } | null };
      if (helperRow?.name) helperFirst = helperRow.name.split(' ')[0];

      const trackUrl = `${siteUrl}/track/${booking_id}`;

      if (resendKey && custEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [custEmail],
            subject: "We're finding you a new helper — VANO",
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Finding a new helper</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Unfortunately <strong>${helperFirst}</strong> is no longer available for your <strong>${catLabel}</strong>. Don't worry — we're finding you another helper right now.</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Need it urgently? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <a href="${trackUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;border:1px solid #e5e7eb;">Track booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${custName}, ${helperFirst} is no longer available for your ${catLabel}. We're finding a new helper. Track: ${trackUrl}. WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {});
      }

      if (resendKey && adminEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [adminEmail],
            subject: `⚠️ Helper released job — ${ref}`,
            text: `${helperFirst} released booking ${ref}.\nJob: ${catLabel}\nCustomer: ${custName} (${custEmail ?? '—'})\nCity: ${b.city ?? '?'}\nStatus reset to pending for re-dispatch.\nID: ${booking_id}`,
          }),
        }).catch(() => {});
      }

      // Expire all pending offers so re-dispatch isn't blocked by idempotency check.
      await supabase
        .from('household_job_offers')
        .update({ status: 'expired' })
        .eq('booking_id', booking_id)
        .eq('status', 'pending');

      // Re-dispatch to other helpers
      fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: { ...b, status: 'pending', student_id: null } }),
      }).catch(() => {});

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── admin_cancel ─────────────────────────────────────────────────────────
    if (type === 'admin_cancel') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await authClient.auth.getUser();
      if (userErr || !user || user.email !== 'vano1app@gmail.com') return bad(403, 'Admin only');

      const refundOk = await stripeRefund();

      await supabase.from('household_bookings').update({ status: 'cancelled' }).eq('id', booking_id);
      await supabase.from('household_job_updates').insert({ booking_id, status: 'cancelled', note: 'Cancelled by admin.' });
      // Kill any open pay link so it can't be paid against this cancelled booking.
      expireCheckoutSession();

      if (resendKey && custEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [custEmail],
            subject: 'Your VANO booking has been cancelled',
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#374151;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Booking cancelled</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We've had to cancel your <strong>${catLabel}</strong> booking. ${refundOk ? 'A full refund has been issued and should appear within 5–7 business days.' : 'Please contact us and we will arrange your refund.'}</p>
    <p style="margin:0;color:#374151;font-size:15px;">Apologies for the inconvenience. WhatsApp us: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${custName}, your VANO ${catLabel} (${ref}) has been cancelled. ${refundOk ? 'Full refund issued (5–7 days).' : 'Contact us about refund.'} WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true, refunded: refundOk }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return bad(400, 'Unknown type');

  } catch (err) {
    console.error('[cancel-household-booking] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
