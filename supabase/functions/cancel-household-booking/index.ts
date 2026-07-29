import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { resolveMoneyAction, releaseBookingMoney } from "../_shared/bookingMoney.ts";

// Three cancellation modes:
//
// type=customer_cancel  — no auth; booking must be 'pending'. Stripe refund + cancel.
// type=helper_release   — auth required (must be the assigned student); releases
//                         job back to 'pending' for re-dispatch, notifies customer.
// type=admin_cancel     — auth required (vano1app@gmail.com); cancels any non-final
//                         booking, issues Stripe refund where possible.

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff', shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
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

    // Helper: release whatever Stripe artifact this booking carries, via the
    // shared rule (_shared/bookingMoney.ts): captured money → refund;
    // AUTH-AT-BOOKING hold (pi_ + no paid_at) → cancel the PI so the hold
    // releases (uncaptured intents cannot be refunded); open session (cs_) →
    // expire it. helper_release deliberately does NOT call this — a hold must
    // SURVIVE a release so the replacement helper's accept can capture it.
    async function releaseMoney(): Promise<{ refunded: boolean; holdReleased: boolean; failedRefund: boolean }> {
      const id = b.stripe_payment_intent_id as string | null;
      const action = resolveMoneyAction(b.paid_at as string | null, id);
      if (action === 'none' || !STRIPE_SECRET || !id) {
        return { refunded: false, holdReleased: false, failedRefund: false };
      }
      const res = await releaseBookingMoney({
        stripeKey: STRIPE_SECRET,
        action,
        stripeId: id,
        idemSuffix: booking_id,
        apiBase: Deno.env.get('STRIPE_API_BASE') ?? undefined,
      });
      if (res.ok && res.action === 'refund') return { refunded: true, holdReleased: false, failedRefund: false };
      if (res.ok && res.action === 'cancel_pi') {
        await supabase.rpc('merge_booking_data', {
          p_id: booking_id,
          p_patch: { fee_auth_canceled_at: new Date().toISOString() },
        }).then(() => {}, () => {});
        return { refunded: false, holdReleased: true, failedRefund: false };
      }
      if (res.ok) return { refunded: false, holdReleased: false, failedRefund: false }; // expire_session
      console.error('[cancel-household-booking] money release failed', res.action, res.error);
      // Only a failed REFUND blocks the cancel — captured money must never be
      // stranded. A failed hold-cancel proceeds: Stripe auto-expires holds
      // within ~7 days, so the customer is never actually charged.
      return { refunded: false, holdReleased: false, failedRefund: res.action === 'refund' };
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
      // route to the manual "message us" path. awaiting_payment = the customer
      // bailed before/at the card step — always cancellable, nothing charged.
      const CANCELLABLE = ['awaiting_payment', 'pending', 'accepted', 'on_way', 'arrived'];
      if (!CANCELLABLE.includes(b.status as string)) {
        return bad(409, 'Your helper has already started — message us to sort out a cancellation.');
      }

      // Compare-and-swap the cancel FIRST. The CANCELLABLE gate above was
      // checked against the status read at fetch time, but releaseMoney() does a
      // Stripe round-trip (~hundreds of ms) during which the helper can flip the
      // job to in_progress (arrival code). Guarding the write on the status
      // still being cancellable means a started job is never cancelled out from
      // under the helper — and, because we only release money after winning the
      // swap, its fee is never refunded either. Matches the sweep-path ordering.
      const { data: cancelledRow } = await supabase
        .from('household_bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking_id)
        .in('status', CANCELLABLE)
        .select('id')
        .maybeSingle();
      if (!cancelledRow) {
        return bad(409, 'Your helper has already started — message us to sort out a cancellation.');
      }

      // Booking is durably cancelled — now release its Stripe artifact. Shared
      // money rule: refund captured money (blocks on failure), cancel an auth
      // hold (proceeds on failure — holds self-expire), expire an open session.
      const money = await releaseMoney();
      if (money.failedRefund) {
        return bad(502, "We couldn't process your refund automatically. Please contact us on WhatsApp: +353 89 981 7111");
      }
      const refundOk = money.refunded;

      await supabase.from('household_job_updates').insert({ booking_id, status: 'cancelled', note: 'Customer cancelled.' });

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
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${catLabel}</strong> booking has been cancelled.${refundOk ? ' A full refund has been issued and should appear on your card within 5–7 business days.' : money.holdReleased ? ' The hold on your card has been released — you were never charged.' : ' You weren\'t charged.'}</p>
    <p style="margin:0 0 0;color:#374151;font-size:15px;">Questions? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${custName}, your VANO ${catLabel} (${ref}) has been cancelled.${refundOk ? ' Full refund issued (5–7 days).' : money.holdReleased ? ' The hold on your card was released — you were never charged.' : " You weren't charged."} Questions? WhatsApp +353 89 981 7111`,
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
            text: `Customer cancelled booking ${ref}.\nJob: ${catLabel}\nCustomer: ${custName} (${custEmail ?? '—'})\nRefund: ${refundOk ? 'Issued' : money.holdReleased ? 'Hold released (never charged)' : 'None (no PI)'}\nID: ${booking_id}`,
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true, refunded: refundOk, hold_released: money.holdReleased }), {
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

      // Expire the OPEN checkout session too. customer_cancel/admin_cancel do
      // this; helper_release didn't, so the old cs_ pay link stayed live after
      // re-dispatch. If the customer paid it after helper B's re-accept minted
      // a fresh session, the second charge landed on an already-paid booking —
      // a silent double-charge. (Reads b.stripe_payment_intent_id, the pre-
      // update snapshot that still holds the cs_ id.)
      // ⚠ AUTH-AT-BOOKING: this must stay cs_-ONLY (expireCheckoutSession, not
      // releaseMoney). An uncaptured pi_ HOLD must SURVIVE a helper release —
      // the booking goes back to pending and the NEXT acceptor's capture uses
      // the same hold. Cancelling it here would strand every re-dispatched
      // auth booking on the pay-link fallback.
      expireCheckoutSession();

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

      // Shared rule: refund captured money / cancel an auth hold / expire an
      // open session. Admin cancel proceeds even when a refund fails (the
      // admin is watching and the email below says what happened).
      const money = await releaseMoney();
      const refundOk = money.refunded;

      await supabase.from('household_bookings').update({ status: 'cancelled' }).eq('id', booking_id);
      await supabase.from('household_job_updates').insert({ booking_id, status: 'cancelled', note: 'Cancelled by admin.' });

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
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We've had to cancel your <strong>${catLabel}</strong> booking. ${refundOk ? 'A full refund has been issued and should appear within 5–7 business days.' : money.holdReleased ? 'The hold on your card has been released — you were never charged.' : b.paid_at ? 'Please contact us and we will arrange your refund.' : 'You weren\'t charged.'}</p>
    <p style="margin:0;color:#374151;font-size:15px;">Apologies for the inconvenience. WhatsApp us: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${custName}, your VANO ${catLabel} (${ref}) has been cancelled. ${refundOk ? 'Full refund issued (5–7 days).' : money.holdReleased ? 'The hold on your card was released — you were never charged.' : b.paid_at ? 'Contact us about refund.' : "You weren't charged."} WhatsApp +353 89 981 7111`,
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ success: true, refunded: refundOk, hold_released: money.holdReleased }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return bad(400, 'Unknown type');

  } catch (err) {
    console.error('[cancel-household-booking] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
