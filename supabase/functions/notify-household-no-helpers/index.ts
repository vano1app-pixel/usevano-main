import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Booking watchdog / dead-man's switch. Runs on a short cron and, for every
// job still pending+unassigned past the alert window, PAGES the owner on
// WhatsApp+email — and keeps re-paging on an escalating cadence until the
// booking leaves 'pending' (a helper accepts, or it's cancelled). A one-shot
// alert can be missed; a repeating pager can't. The customer reassurance email
// is still sent only once.
//
//   NO_HELPERS_ALERT_MINUTES   first page after this many min pending (default 10)
//   ADMIN_ALERT_REPEAT_MINUTES re-page interval until resolved      (default 10)
//
// Schedule: run frequently so re-pages land on time
//   Edge Functions → notify-household-no-helpers → Schedule → */5 * * * *

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  // First page after alertMinutes pending; re-page every repeatMinutes after
  // that until the booking is no longer pending. No schema change — the page
  // cadence is tracked in booking_data (last_admin_alert_at / admin_alert_count).
  const alertMinutes  = Number(Deno.env.get('NO_HELPERS_ALERT_MINUTES')) || 10;
  const repeatMinutes = Number(Deno.env.get('ADMIN_ALERT_REPEAT_MINUTES')) || 10;
  const now           = Date.now();
  const alertCutoff   = new Date(now - alertMinutes * 60 * 1000).toISOString();

  // NOTE: deliberately NOT filtering on no_helpers_email_sent_at — every still-
  // pending booking is re-evaluated each run so the owner page can repeat.
  const nowIso = new Date(now).toISOString();
  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, scheduled_at, city, price_estimate_cents, paid_at, created_at, no_helpers_email_sent_at, booking_data')
    .eq('status', 'pending')
    .is('student_id', null)
    .lt('created_at', alertCutoff)
    // Don't page the owner (or email the customer "taking longer than usual")
    // for a BOOK-AHEAD job — it's pending only because its dispatch window
    // hasn't arrived. It becomes alert-eligible once its slot time has passed
    // with still no helper. Mirrors no-helper-fallback's guard.
    .or(`scheduled_at.is.null,scheduled_at.lt.${nowIso}`);

  if (error) {
    console.error('[watchdog] query error', error);
    return new Response('DB error', { status: 500 });
  }

  let customerEmails = 0;
  let adminPages = 0;

  for (const b of (bookings ?? [])) {
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? String(b.category);
    const custName  = String(b.customer_name || 'there');
    const ref       = String(b.id).slice(-8).toUpperCase();
    const trackUrl  = `${siteUrl}/track/${b.id}`;
    const waLink    = 'https://wa.me/353899817111';

    // ── Customer reassurance email — ONCE per booking ─────────────────────────
    // Pay-after-accept: a pending, unassigned booking normally has NEVER been
    // charged (the Stripe session isn't created until a helper accepts), so the
    // "your payment is safe / full refund" line only applies to the rare
    // sweep-released paid booking. Show it only when money actually moved.
    const isPaid = !!b.paid_at;
    const paymentLine = isPaid
      ? ' · Your payment is safe — full refund if we can\'t find anyone.'
      : ' · You haven\'t been charged — you only pay once a helper accepts.';
    if (!b.no_helpers_email_sent_at && resendKey && b.customer_email) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">We're still on it 🔍</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
      We're still finding the right helper for your <strong>${catLabel}</strong> —
      it's taking a little longer than usual but we haven't forgotten you.
    </p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      If you need an update or want to talk to us directly, just tap below —
      we reply on WhatsApp straight away.
    </p>
    <a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;margin-bottom:12px;">Message us on WhatsApp →</a>
    <br>
    <a href="${trackUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;border:1px solid #e5e7eb;">Track booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}${paymentLine}</p>
  </div>
</div>
</body></html>`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [b.customer_email as string],
          subject: `Still finding your helper — VANO`,
          html,
          text: `Hi ${custName}, we're still finding your helper for ${catLabel}. Takes a little longer today. Message us on WhatsApp: ${waLink}. Ref: ${ref}`,
        }),
      });
      // Only stamp on a SUCCESSFUL send. Stamping regardless meant one transient
      // Resend 429/5xx permanently killed the single reassurance email this
      // system owes the customer — on exactly the booking most likely to churn.
      // Left unstamped, the next run retries.
      if (!res.ok) {
        console.warn('[watchdog] customer Resend error — will retry next run', b.id, res.status);
      } else {
        customerEmails++;
        await supabase
          .from('household_bookings')
          .update({ no_helpers_email_sent_at: new Date().toISOString() })
          .eq('id', b.id);
      }
    }

    // ── Owner page — REPEATING escalation until the booking is resolved ───────
    const bd          = (b.booking_data ?? {}) as Record<string, unknown>;
    const lastAlertMs = bd.last_admin_alert_at ? Date.parse(String(bd.last_admin_alert_at)) : 0;
    const attempts    = Number(bd.admin_alert_count) || 0;
    const duePage     = !lastAlertMs || (now - lastAlertMs) >= repeatMinutes * 60 * 1000;
    if (!duePage) continue;

    const waitingMinutes = Math.max(0, Math.round((now - Date.parse(String(b.created_at))) / 60000));
    const attempt        = attempts + 1;

    // Routed through notify-admin-whatsapp: WhatsApp + guaranteed email fallback
    // + a tap-to-call link to the customer. Fire-and-forget so a Twilio/Resend
    // hiccup can never stop the watchdog from recording the page.
    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'no_helpers',
        stage: 'expired',
        attempt,
        waiting_minutes: waitingMinutes,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        category: b.category,
        city: b.city,
        scheduled_date: b.scheduled_date,
        price_euros: b.price_estimate_cents ? (b.price_estimate_cents / 100).toFixed(2) : undefined,
        booking_id: b.id,
      }),
    }).catch(() => {});

    // Record this page so the next one waits a full interval. Atomic top-level
    // JSON merge (only our two keys) so a concurrent redispatch-stale-jobs
    // round bump can't clobber the alert counters, and ours can't revert its
    // redispatch_round — a plain .update({booking_data}) rewrote the whole blob
    // from the query snapshot, losing whichever cron wrote in between.
    await supabase
      .rpc('merge_booking_data', { p_id: b.id, p_patch: { last_admin_alert_at: new Date(now).toISOString(), admin_alert_count: attempt } });

    adminPages++;
  }

  console.log(`[watchdog] checked ${(bookings ?? []).length} pending · customer emails ${customerEmails} · owner pages ${adminPages}`);
  return new Response(
    JSON.stringify({ ok: true, checked: (bookings ?? []).length, customerEmails, adminPages }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
