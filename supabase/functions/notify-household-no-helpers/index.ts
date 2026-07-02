import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderHouseholdEmail, emailP, escapeHtml, categoryLabel, greetName,
  sendHouseholdEmail,
} from "../_shared/householdEmail.ts";

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

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
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
  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, city, price_estimate_cents, created_at, no_helpers_email_sent_at, booking_data')
    .eq('status', 'pending')
    .is('student_id', null)
    .lt('created_at', alertCutoff);

  if (error) {
    console.error('[watchdog] query error', error);
    return new Response('DB error', { status: 500 });
  }

  let customerEmails = 0;
  let adminPages = 0;

  for (const b of (bookings ?? [])) {
    const catLabel  = categoryLabel(b.category as string);
    const custName  = greetName(b.customer_name as string | null);
    const ref       = String(b.id).slice(-8).toUpperCase();
    const trackUrl  = `${siteUrl}/track/${b.id}`;
    const waLink    = 'https://wa.me/353899817111';

    // ── Customer reassurance email — ONCE per booking ─────────────────────────
    if (!b.no_helpers_email_sent_at && resendKey && b.customer_email) {
      // HTML-safe variants for interpolation (raw values stay in text/subject).
      const custNameHtml = escapeHtml(custName);
      const catLabelHtml = escapeHtml(catLabel);

      const html = renderHouseholdEmail({
        preheader: `Taking a little longer than usual — you haven't paid anything, and we're still searching.`,
        eyebrow: 'Finding your helper',
        heading: `We're still on it 🔍`,
        bodyHtml: [
          emailP(`Hi ${custNameHtml},`),
          emailP(`We're still finding the right helper for your <strong>${catLabelHtml}</strong> — it's taking a little longer than usual but we haven't forgotten you.`),
          emailP(`If you need an update or want to talk to us directly, just tap below — we reply on WhatsApp straight away.`, { last: true }),
        ].join(''),
        ctas: [
          { label: 'Message us on WhatsApp →', url: waLink, variant: 'whatsapp' },
          { label: 'Track booking →', url: trackUrl },
        ],
        footerNote: `Ref: ${ref} · You haven't paid anything — you only pay once a helper is confirmed.`,
      });

      const sendOk = await sendHouseholdEmail({
        to: b.customer_email as string,
        subject: `Still finding your helper — VANO`,
        html,
        text: `Hi ${custName}, we're still finding your helper for ${catLabel}. Takes a little longer today. Message us on WhatsApp: ${waLink}. Ref: ${ref}`,
      });
      if (!sendOk) console.warn('[watchdog] customer Resend error', b.id);
      else customerEmails++;
      await supabase
        .from('household_bookings')
        .update({ no_helpers_email_sent_at: new Date().toISOString() })
        .eq('id', b.id);
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

    // Record this page so the next one waits a full interval (merge to preserve
    // redispatch_round and anything else already in booking_data).
    await supabase
      .from('household_bookings')
      .update({ booking_data: { ...bd, last_admin_alert_at: new Date(now).toISOString(), admin_alert_count: attempt } })
      .eq('id', b.id);

    adminPages++;
  }

  console.log(`[watchdog] checked ${(bookings ?? []).length} pending · customer emails ${customerEmails} · owner pages ${adminPages}`);
  return new Response(
    JSON.stringify({ ok: true, checked: (bookings ?? []).length, customerEmails, adminPages }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
