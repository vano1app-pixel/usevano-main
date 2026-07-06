import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron: rescue accepted-but-unpaid household bookings.
//
// Pay-after-accept means a helper can be confirmed while the customer never
// completes payment. Until now that was a silent black hole: one pay prompt at
// accept time, then nothing — no reminder, no retry, no timeout. The booking
// sat 'accepted' forever and the helper was committed to work that might never
// be paid for. This closes that hole:
//
//   1. If the Stripe session failed to create at accept time (no
//      stripe_checkout_url), regenerate it via notify-household-accepted —
//      which also sends the first pay prompt.
//   2. Otherwise re-send the existing pay link to the customer (email + SMS/
//      WhatsApp) on a repeating cadence — most unpaid bookings are just
//      forgetful customers, and a nudge recovers the booking.
//   3. After PAY_TIMEOUT_HOURS still unpaid, release the helper and cancel the
//      booking, telling the customer, the helper and the owner — so nobody
//      does unpaid work.
//
// Cadence is tracked in booking_data (last_pay_reminder_at / pay_reminder_count)
// — no schema change, exactly like the no-helpers watchdog. All customer/helper/
// owner notifications are fire-and-forget so a Resend/Twilio hiccup can never
// stop the cron from recording its progress.
//
// Schedule: run every few minutes
//   Edge Functions → remind-unpaid-bookings → Schedule → */5 * * * *
//
//   PAY_REMINDER_FIRST_MINUTES   first nudge this long after the pay request (default 15)
//   PAY_REMINDER_REPEAT_MINUTES  re-nudge interval until paid or timed out      (default 30)
//   PAY_TIMEOUT_HOURS            release + cancel after this long unpaid         (default 6)

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', other: 'General help',
};

// ── Customer SMS via Twilio (WhatsApp preferred, SMS fallback) — same shape as
//    notify-household-accepted so behaviour and config are consistent. ───────
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

// Expire the open Stripe checkout session so a stale pay link can't be paid
// after the booking was released/cancelled (which would land money on a dead
// booking). notify-household-accepted stores the session id (cs_…) in
// stripe_payment_intent_id. Best-effort — never blocks the sweep.
function expireStripeSession(sessId: string | null | undefined): void {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key || !sessId || !sessId.startsWith('cs_')) return;
  void fetch(`https://api.stripe.com/v1/checkout/sessions/${sessId}/expire`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => {});
}

async function sendCustomerSms(to: string | null | undefined, body: string): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const post = (params: Record<string, string>) =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try {
      const resp = await post({ To: `whatsapp:${e164}`, From: from, Body: body });
      if (resp.ok) return true;
      console.warn('[unpaid] whatsapp error', resp.status, (await resp.text()).slice(0, 160));
    } catch (e) { console.warn('[unpaid] whatsapp exception', e); }
  }
  // SMS fallback — off until a carrier-trusted Irish number is configured.
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const smsFrom = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!smsFrom || smsFrom.startsWith('whatsapp:')) return false;
  try {
    const resp = await post({ To: e164, From: smsFrom, Body: body });
    return resp.ok;
  } catch (e) { console.warn('[unpaid] sms exception', e); return false; }
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  const firstMin     = Number(Deno.env.get('PAY_REMINDER_FIRST_MINUTES'))  || 15;
  const repeatMin    = Number(Deno.env.get('PAY_REMINDER_REPEAT_MINUTES')) || 30;
  const timeoutHours = Number(Deno.env.get('PAY_TIMEOUT_HOURS'))           || 6;
  const now          = Date.now();

  // Only 'accepted' bookings: once a helper is en route (on_way/arrived/…) we
  // never auto-cancel from under them. paid_at IS NULL is the unpaid signal.
  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_phone, category, student_id, stripe_checkout_url, stripe_payment_intent_id, paid_at, payment_requested_at, booking_data, created_at')
    .eq('status', 'accepted')
    .is('paid_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[unpaid] query error', error);
    return new Response('DB error', { status: 500 });
  }

  // Batch-load the assigned helpers (name for copy, email/phone to notify them
  // on release) so we don't query per booking.
  const studentIds = [...new Set((bookings ?? []).map((b) => b.student_id).filter(Boolean))] as string[];
  const helperByUser = new Map<string, { first: string; email: string | null; phone: string | null }>();
  if (studentIds.length) {
    const { data: helpers } = await supabase
      .from('household_helpers')
      .select('user_id, name, email, phone')
      .in('user_id', studentIds) as { data: Array<{ user_id: string; name: string | null; email: string | null; phone: string | null }> | null };
    for (const h of helpers ?? []) {
      if (h.user_id) helperByUser.set(h.user_id, {
        first: (String(h.name ?? '').split(' ')[0] || 'Your helper'),
        email: h.email, phone: h.phone,
      });
    }
  }

  let reminded = 0, generated = 0, cancelled = 0;

  for (const b of bookings ?? []) {
    const bd          = (b.booking_data ?? {}) as Record<string, unknown>;
    // payment_requested_at is stamped when the Stripe session is created at
    // accept time — our reliable "the pay clock started" signal. created_at is
    // NOT a safe fallback (a booking can be created hours before it's accepted).
    const requestedMs = b.payment_requested_at ? Date.parse(String(b.payment_requested_at)) : null;
    const lastMs      = bd.last_pay_reminder_at ? Date.parse(String(bd.last_pay_reminder_at)) : 0;
    const count       = Number(bd.pay_reminder_count) || 0;
    const cadenceDue  = !lastMs || (now - lastMs) >= repeatMin * 60 * 1000;
    const helper    = b.student_id ? helperByUser.get(b.student_id) : undefined;
    const helperFirst = helper?.first ?? 'Your helper';
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? 'job';
    const custName  = b.customer_name && b.customer_name !== 'Guest' ? String(b.customer_name) : 'there';
    const ref       = String(b.id).slice(-8).toUpperCase();
    const trackUrl  = `${siteUrl}/track/${b.id}`;

    // ── No pay link yet: the Stripe session failed to create at accept time.
    //    Retry generating it via notify-household-accepted (which also sends the
    //    first prompt) on the repeat cadence until it sticks. We never time-out
    //    a booking that never got a pay link — that clock only starts once
    //    payment_requested_at exists.
    if (requestedMs === null || !b.stripe_checkout_url) {
      if (!cadenceDue) continue;
      void fetch(`${supabaseUrl}/functions/v1/notify-household-accepted`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-accept': '1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: b.id }),
      }).catch(() => {});
      await supabase.from('household_bookings')
        .update({ booking_data: { ...bd, last_pay_reminder_at: new Date(now).toISOString(), pay_reminder_count: count + 1 } })
        .eq('id', b.id);
      generated++;
      continue;
    }

    const ageMin = (now - requestedMs) / 60000;

    // ── Timeout: release the helper + cancel, only if still accepted+unpaid ──
    if (ageMin >= timeoutHours * 60) {
      const { data: done } = await supabase
        .from('household_bookings')
        .update({ status: 'cancelled', booking_data: { ...bd, cancelled_reason: 'payment_timeout', cancelled_at: new Date(now).toISOString() } })
        .eq('id', b.id)
        .eq('status', 'accepted')
        .is('paid_at', null)
        .select('id')
        .maybeSingle();
      if (!done) continue; // paid or moved on between query and now — leave it

      void supabase.from('household_job_updates').insert({ booking_id: b.id, status: 'cancelled' });

      // Expire the open Stripe checkout session so the stale pay link can't be
      // paid after release (which would land money on a cancelled booking).
      expireStripeSession(b.stripe_payment_intent_id as string | null);

      // Tell the helper not to proceed — their pocket channels + email.
      if (helper?.phone) void sendCustomerSms(helper.phone, `VANO: the ${catLabel} you accepted was cancelled — the customer didn't complete payment, so please don't proceed. More jobs are waiting in the app.`);
      if (resendKey && helper?.email) {
        void fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [helper.email],
            subject: `Job released — payment wasn't completed (${ref})`,
            text: `Hi ${helperFirst}, the ${catLabel} you accepted has been released because the customer didn't complete payment in time. Please don't proceed with it. There are more jobs waiting: ${siteUrl}/student-dashboard`,
          }),
        }).catch(() => {});
      }

      // Tell the customer it lapsed (so they can rebook) — SMS + email.
      if (b.customer_phone) void sendCustomerSms(b.customer_phone, `VANO: your ${catLabel} booking was cancelled because payment wasn't completed. No charge was made — rebook anytime: ${siteUrl}`);
      if (resendKey && b.customer_email) {
        void fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: [b.customer_email as string],
            subject: `Your VANO booking lapsed — no payment received`,
            text: `Hi ${custName}, we couldn't confirm your ${catLabel} because payment wasn't completed, so the booking has been released. You weren't charged. Rebook anytime: ${siteUrl}. Ref: ${ref}`,
          }),
        }).catch(() => {});
      }

      // Page the owner.
      void fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `⚠️ *Auto-released unpaid booking* (${ref})\n${catLabel} — ${helperFirst} was confirmed but the customer never paid (waited ${Math.round(ageMin / 60)}h). Booking cancelled, both sides notified.`,
          subject: `⚠️ Unpaid booking released — ${catLabel} — ${ref}`,
          contact_phone: b.customer_phone,
        }),
      }).catch(() => {});

      cancelled++;
      continue;
    }

    // ── Due for a reminder? Re-send the existing pay link to the customer
    //    (email + SMS/WhatsApp) — no owner spam on routine nudges. ──────────
    if (!(ageMin >= firstMin && cadenceDue)) continue;

    const payUrl   = b.stripe_checkout_url as string;
    const nudgeTag = count >= 1 ? ' (reminder)' : '';

    if (b.customer_phone) {
      void sendCustomerSms(b.customer_phone, `VANO${nudgeTag}: ${helperFirst} is confirmed for your ${catLabel} — just complete your secure payment to lock them in: ${payUrl}`);
    }
    if (resendKey && b.customer_email) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperFirst} is waiting on you</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirst}</strong> has accepted your <strong>${catLabel}</strong> — you just need to complete your secure payment to lock them in. No cash needed on the day.
    </p>
    <a href="${payUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;">Complete payment →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · Card, Apple Pay or Google Pay · secured by Stripe<br>Questions? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#9ca3af;">+353 89 981 7111</a></p>
  </div>
</div>
</body></html>`;
      void fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [b.customer_email as string],
          subject: `${helperFirst} is confirmed for your ${catLabel} — complete your payment`,
          html,
          text: `Hi ${custName}, ${helperFirst} accepted your ${catLabel} — complete your secure payment to lock them in: ${payUrl}. Track: ${trackUrl}. Ref: ${ref}`,
        }),
      }).catch(() => {});
    }

    await supabase.from('household_bookings')
      .update({ booking_data: { ...bd, last_pay_reminder_at: new Date(now).toISOString(), pay_reminder_count: count + 1 } })
      .eq('id', b.id);
    reminded++;
  }

  // ── RELEASE + CANCEL sweep ───────────────────────────────────────────────
  //
  // The reminder loop above only handles 'accepted'. Two further unpaid
  // outcomes are handled here, both best-effort and idempotent (the UPDATE
  // WHERE clauses re-check status + paid_at so a re-run can never touch a row
  // that already moved on, and never touches paid or in_progress/completed):
  //
  //   RELEASE — an assigned helper is committed to a job the customer hasn't
  //     paid for. After RELEASE_AFTER_HOURS (default 2h) since the pay request
  //     we free the helper (student_id→NULL, status→pending), clear the stale
  //     pay link, note it, tell the helper, and re-dispatch to find someone
  //     else. This recovers the booking instead of killing it.
  //
  //   CANCEL — a booking that's been unpaid since creation for
  //     CANCEL_AFTER_HOURS (default 24h) and never progressed past on_way is
  //     given up on entirely (status→cancelled + note).
  //
  // Re-dispatch loop prevention: RELEASE sets status='pending' and expires open
  // offers, exactly like helper_release in cancel-household-booking, so
  // dispatch-household-job's own idempotency (skip if non-expired offers exist)
  // applies. A released-then-reaccepted-then-unpaid booking can be released
  // again — that's intended (each release re-opens the search), but the 24h
  // CANCEL backstop guarantees it can't churn forever.
  const releaseAfterHours = Number(Deno.env.get('UNPAID_RELEASE_AFTER_HOURS')) || 2;
  const cancelAfterHours  = Number(Deno.env.get('UNPAID_CANCEL_AFTER_HOURS'))  || 24;
  const SWEEP_LIMIT = 50;
  let released = 0, swept_cancelled = 0;

  // RELEASE: assigned + unpaid + priced, pay requested over RELEASE_AFTER_HOURS ago.
  const releaseCutoff = new Date(now - releaseAfterHours * 60 * 60 * 1000).toISOString();
  const { data: releaseCandidates } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_phone, category, city, student_id, price_estimate_cents, payment_requested_at, scheduled_date, booking_data, stripe_payment_intent_id')
    .in('status', ['accepted', 'on_way'])
    .not('student_id', 'is', null)
    .is('paid_at', null)
    .gt('price_estimate_cents', 0)
    .not('payment_requested_at', 'is', null)
    .lt('payment_requested_at', releaseCutoff)
    .order('payment_requested_at', { ascending: true })
    .limit(SWEEP_LIMIT) as { data: Array<Record<string, unknown>> | null };

  // Batch-load helper contact info for the release notification.
  const relStudentIds = [...new Set((releaseCandidates ?? []).map((b) => b.student_id).filter(Boolean))] as string[];
  const relHelperByUser = new Map<string, { first: string; email: string | null; phone: string | null }>();
  if (relStudentIds.length) {
    const { data: relHelpers } = await supabase
      .from('household_helpers')
      .select('user_id, name, email, phone')
      .in('user_id', relStudentIds) as { data: Array<{ user_id: string; name: string | null; email: string | null; phone: string | null }> | null };
    for (const h of relHelpers ?? []) {
      if (h.user_id) relHelperByUser.set(h.user_id, {
        first: (String(h.name ?? '').split(' ')[0] || 'Your helper'),
        email: h.email, phone: h.phone,
      });
    }
  }

  for (const b of releaseCandidates ?? []) {
    const id = String(b.id);
    const ref = id.slice(-8).toUpperCase();
    const catLabel = CATEGORY_LABELS[b.category as string] ?? 'job';
    const helper = b.student_id ? relHelperByUser.get(b.student_id as string) : undefined;
    const helperFirst = helper?.first ?? 'Your helper';

    // Free the helper + reset to pending. Guarded so a paid/progressed row is
    // never touched (idempotent across re-runs).
    const { data: freed } = await supabase
      .from('household_bookings')
      .update({
        student_id: null,
        status: 'pending',
        stripe_checkout_url: null,
        payment_requested_at: null,
        worker_lat: null,
        worker_lng: null,
        worker_location_updated_at: null,
      })
      .eq('id', id)
      .in('status', ['accepted', 'on_way'])
      .not('student_id', 'is', null)
      .is('paid_at', null)
      .select('id, customer_name, customer_email, customer_phone, category, city, scheduled_date, price_estimate_cents')
      .maybeSingle() as { data: Record<string, unknown> | null };
    if (!freed) continue; // paid or moved on between query and now

    void supabase.from('household_job_updates').insert({
      booking_id: id, status: 'cancelled',
      note: 'Helper released automatically — customer did not pay in time. Finding another helper.',
    });

    // Notify the released helper (best-effort, same channels as the timeout path).
    if (helper?.phone) void sendCustomerSms(helper.phone, `VANO: the ${catLabel} you accepted has been freed up — the customer didn't pay in time, so you're no longer assigned. More jobs are waiting in the app.`);
    if (resendKey && helper?.email) {
      void fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [helper.email],
          subject: `Job freed up — payment wasn't completed (${ref})`,
          text: `Hi ${helperFirst}, the ${catLabel} you accepted has been released because the customer didn't complete payment in time, so you're no longer assigned. There are more jobs waiting: ${siteUrl}/student-dashboard`,
        }),
      }).catch(() => {});
    }

    // Kill the stale pay link — the customer still holds it in email/SMS, and
    // paying it after release would stamp paid_at on a re-assigned booking.
    expireStripeSession(b.stripe_payment_intent_id as string | null);

    // Expire open offers so re-dispatch isn't blocked by its idempotency check.
    await supabase
      .from('household_job_offers')
      .update({ status: 'expired' })
      .eq('booking_id', id)
      .eq('status', 'pending');

    // Re-dispatch to other helpers — await + log non-2xx (best-effort).
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ record: { ...freed, status: 'pending', student_id: null }, quiet: false }),
      });
      if (!resp.ok) console.warn('[unpaid] re-dispatch non-2xx', id, resp.status, (await resp.text()).slice(0, 160));
    } catch (e) {
      console.warn('[unpaid] re-dispatch threw', id, e);
    }

    released++;
  }

  // CANCEL: unpaid since creation for CANCEL_AFTER_HOURS, still in an early
  // (non-final, non-in_progress) status. Guarded so paid/in_progress/completed
  // rows are never touched.
  const cancelCutoff = new Date(now - cancelAfterHours * 60 * 60 * 1000).toISOString();
  const { data: cancelCandidates } = await supabase
    .from('household_bookings')
    .select('id, stripe_payment_intent_id')
    .is('paid_at', null)
    .in('status', ['pending', 'accepted', 'on_way'])
    .lt('created_at', cancelCutoff)
    // Don't 24h-cancel a future-dated booking that simply hasn't come due yet.
    .or(`scheduled_at.is.null,scheduled_at.lt.${new Date(now).toISOString()}`)
    .order('created_at', { ascending: true })
    .limit(SWEEP_LIMIT) as { data: Array<{ id: string; stripe_payment_intent_id: string | null }> | null };

  for (const b of cancelCandidates ?? []) {
    const { data: done } = await supabase
      .from('household_bookings')
      .update({ status: 'cancelled' })
      .eq('id', b.id)
      .is('paid_at', null)
      .in('status', ['pending', 'accepted', 'on_way'])
      .select('id')
      .maybeSingle() as { data: { id: string } | null };
    if (!done) continue; // paid or progressed between query and now
    // Kill the stale pay link so it can't be paid against a cancelled booking.
    expireStripeSession(b.stripe_payment_intent_id);
    void supabase.from('household_job_updates').insert({
      booking_id: b.id, status: 'cancelled',
      note: 'Cancelled automatically — unpaid for over 24 hours.',
    });
    swept_cancelled++;
  }

  console.log(`[unpaid] checked ${(bookings ?? []).length} accepted-unpaid · reminded ${reminded} · links regenerated ${generated} · timeout-cancelled ${cancelled} · released ${released} · swept-cancelled ${swept_cancelled}`);
  return new Response(
    JSON.stringify({ ok: true, checked: (bookings ?? []).length, reminded, generated, cancelled, released, swept_cancelled }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
