import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Safety net for jobs awaiting the customer's "mark complete":
//   1. Remind the customer to confirm (once) when the job looks done — i.e. the
//      helper tapped "I've finished" or a timed job's clock ran out.
//   2. If still unconfirmed 12h after the reminder, alert an admin (once).
//   3. If STILL unconfirmed 48h after the reminder, auto-confirm the job via
//      the internal capture-household-payment path — the same single source of
//      truth the customer's own "mark complete" and the admin button use.
// Stage 3 exists because a ghosting customer used to strand the helper's
// (already-charged) money forever. The reminder tells the customer up front
// that silence for 48h counts as confirmation, and the money-back guarantee
// still applies afterwards. Only PAID jobs are touched (unpaid ones are
// chased by the separate unpaid-booking reminders).
//
// Two modes:
//   POST { booking_id }  → remind that one customer now (called by
//                          household-arrival when the helper marks finished).
//   POST {}              → cron sweep (suggested cadence: every 15–30 min).
//
// verify_jwt = false — called by the scheduler / internally with the service key.

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff', shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

const ESCALATE_MS = 12 * 60 * 60 * 1000; // alert admin 12h after the customer reminder
const AUTO_COMPLETE_MS = 48 * 60 * 60 * 1000; // auto-confirm 48h after the customer reminder

function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.replace(/[\s\-().]/g, '').trim();
  if (!c) return null;
  if (c.startsWith('+')) return /^\+\d{8,15}$/.test(c) ? c : null;
  if (c.startsWith('00')) { const v = '+' + c.slice(2); return /^\+\d{8,15}$/.test(v) ? v : null; }
  if (/^08[3-9]\d{7}$/.test(c)) return '+353' + c.slice(1);
  if (/^8[3-9]\d{7}$/.test(c)) return '+353' + c;
  return null;
}

async function sendSms(to: string | null | undefined, body: string): Promise<boolean> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  const smsFrom = Deno.env.get('TWILIO_SMS_FROM')?.trim() || Deno.env.get('TWILIO_FROM_NUMBER')?.trim();
  const send = async (To: string, From: string) => {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To, From, Body: body }).toString(),
    });
    return resp.ok;
  };
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try { if (await send(`whatsapp:${e164}`, from)) return true; } catch { /* fall through to SMS */ }
  }
  if (smsFrom) { try { return await send(e164, smsFrom); } catch { return false; } }
  return false;
}

interface Booking {
  id: string; status: string; paid_at: string | null;
  customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  category: string | null; student_id: string | null;
  price_estimate_cents: number | null; booking_data: Record<string, unknown> | null;
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const adminEmail  = Deno.env.get('ADMIN_EMAIL')?.trim();
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
  const supabase = createClient(supabaseUrl, serviceKey);

  const helperFirstName = async (studentId: string | null): Promise<string> => {
    if (!studentId) return 'your helper';
    const { data } = await supabase.from('household_helpers').select('name').eq('user_id', studentId).maybeSingle() as { data: { name?: string } | null };
    return data?.name ? data.name.split(' ')[0] : 'your helper';
  };

  // Ask the customer to confirm. Returns true if at least one channel went out.
  // DIRECT-PAY: this is the settle-up moment — the customer owes the HELPER
  // (not Vano), so the message leads with the one-tap prefilled Revolut link
  // at the exact second the helper says they're done. The old "releases their
  // payment" copy was escrow-era and untrue under direct-pay.
  const remindCustomer = async (b: Booking): Promise<boolean> => {
    const helper = await helperFirstName(b.student_id);
    const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
    const custName = b.customer_name && b.customer_name !== 'Guest' ? b.customer_name : 'there';
    const trackUrl = `${siteUrl}/track/${b.id}`;
    let ok = false;

    // Same tag-shape rules as capture-household-payment's completion email:
    // accepts @tag / bare tag / pasted revolut.me URL; builds the request-link
    // shape revolut.me/<tag>/<amount> so the app opens with recipient AND
    // amount pre-filled.
    const bd = (b.booking_data ?? {}) as Record<string, unknown>;
    // Card-pay (2026-07-30): the customer already paid everything by card —
    // the settle-up copy would ask them to pay twice. Those read like legacy.
    const directPay = bd.direct_pay === true && bd.card_pay !== true;
    const priceCents = b.price_estimate_cents ?? 0;
    const amt = (priceCents / 100).toFixed(2).replace(/\.00$/, '');
    const rawHandle = String(bd.helper_payment_handle ?? '').trim();
    const revTag = rawHandle.match(/^(?:https?:\/\/)?(?:www\.)?revolut\.me\/@?([a-z0-9_]{3,16})\/?(?:[?#].*)?$/i) ?? rawHandle.match(/^@?([a-z0-9_]{3,16})$/i);
    const revolutUrl = directPay && priceCents > 0 && revTag ? `https://revolut.me/${revTag[1]}/${amt}` : null;

    if (resendKey && b.customer_email) {
      const bodyLine = directPay
        ? `<strong>${helper}</strong> has wrapped up your <strong>${cat}</strong>. Settle up directly — <strong>€${amt}</strong> by ${revolutUrl ? 'Revolut (one tap below)' : 'Revolut or cash'} — they keep 100%. Then confirm it's done.`
        : `<strong>${helper}</strong> has wrapped up your <strong>${cat}</strong>. Tap below to confirm it's done — that's what releases their payment.`;
      const buttons = directPay && revolutUrl
        ? `<a href="${revolutUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Pay ${helper} €${amt} →</a>
    <p style="margin:12px 0 0;font-size:13px;"><a href="${trackUrl}" style="color:#4a7c59;font-weight:600;">Paid already? Confirm it's done →</a></p>`
        : `<a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">${directPay ? `Settle up &amp; confirm →` : `Confirm &amp; pay ${helper} →`}</a>`;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;"><p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Is your job all done?</p></div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">${bodyLine}</p>
    ${buttons}
    <p style="margin:20px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">If we don't hear from you within 48 hours we'll confirm it automatically so ${helper} isn't left waiting — your money-back guarantee still applies either way.</p>
    <p style="margin:12px 0 0;color:#9ca3af;font-size:12px;">Not done yet, or a problem? WhatsApp us: +353 89 981 7111</p>
  </div>
</div></body></html>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [b.customer_email], subject: directPay ? `All done — settle up with ${helper} (€${amt})` : `Confirm your ${cat} is done — VANO`, html, text: directPay
          ? `Hi ${custName}, ${helper} has finished your ${cat} 🎉 Settle up directly — €${amt}${revolutUrl ? `, one tap: ${revolutUrl}` : ' (Revolut or cash)'} — they keep 100%. Then confirm it's done: ${trackUrl} (auto-confirms in 48h — money-back guarantee still applies)`
          : `Hi ${custName}, ${helper} has finished your ${cat}. Confirm it's done to release their payment: ${trackUrl} — If we don't hear back within 48h we'll confirm automatically (money-back guarantee still applies). Problem? WhatsApp +353 89 981 7111` }),
      });
      ok = res.ok || ok;
    }
    const sms = await sendSms(b.customer_phone, directPay
      ? `VANO: ${helper} has finished your ${cat} 🎉 Settle up — pay ${helper} €${amt}${revolutUrl ? ` in one tap: ${revolutUrl}` : ' (Revolut or cash)'} then confirm here: ${trackUrl}`
      : `VANO: ${helper} has finished your ${cat}. Confirm it's done to release their payment: ${trackUrl} (auto-confirms in 48h if we don't hear back — money-back guarantee still applies)`);
    return ok || sms;
  };

  const escalateAdmin = async (b: Booking, kind: 'unconfirmed' | 'stuck_arrived' = 'unconfirmed'): Promise<boolean> => {
    if (!resendKey || !adminEmail) return false;
    const helper = await helperFirstName(b.student_id);
    const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
    const ref = b.id.slice(-8).toUpperCase();
    const contact = `${b.customer_name ?? '—'}, ${b.customer_phone ?? '—'}, ${b.customer_email ?? '—'}`;
    const subject = kind === 'stuck_arrived'
      ? `⚠️ Helper stuck at arrival — follow up (${ref})`
      : `⏳ Unconfirmed job — follow up (${ref})`;
    const text = kind === 'stuck_arrived'
      ? `${helper} marked themselves as arrived for a ${cat} but hasn't started (the arrival code was never entered) after a while.\nCustomer: ${contact}\nCheck in with both sides: ${siteUrl}/track/${b.id}\nRef: ${ref}`
      : `${helper} marked a ${cat} finished but the customer (${contact}) hasn't confirmed after the reminder.\nThe helper is unpaid until it's confirmed.\nFollow up / mark complete: ${siteUrl}/track/${b.id}\nRef: ${ref}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [adminEmail], subject, text }),
    });
    return res.ok;
  };

  const cols = 'id, status, paid_at, customer_name, customer_email, customer_phone, category, student_id, price_estimate_cents, booking_data';

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;

    // ── On-demand: remind one customer now (helper just tapped finished) ──
    if (bookingId) {
      const { data: b } = await supabase.from('household_bookings')
        .select(`${cols}, completion_reminded_at, helper_finished_at, job_ends_at`).eq('id', bookingId).maybeSingle() as { data: (Booking & { completion_reminded_at: string | null; helper_finished_at: string | null; job_ends_at: string | null }) | null };
      if (!b || b.status !== 'in_progress' || !b.paid_at) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } });
      // Only start the confirm / 48h auto-confirm clock once the job actually
      // LOOKS done (helper finished, or a timed job elapsed) — same guard as
      // cron Stage 1. Without it, anyone who knows a booking UUID could POST to
      // this unauthenticated endpoint and start the auto-confirm clock on a job
      // still genuinely in progress.
      const looksDone = !!b.helper_finished_at || (!!b.job_ends_at && new Date(b.job_ends_at).getTime() < Date.now());
      if (!looksDone) return new Response(JSON.stringify({ ok: true, skipped: 'not_done' }), { headers: { 'Content-Type': 'application/json' } });
      // Claim first (guarded on null) so an overlapping cron Stage-1 sweep can't
      // also remind the same customer.
      const { data: claimed } = await supabase.from('household_bookings')
        .update({ completion_reminded_at: new Date().toISOString() })
        .eq('id', bookingId).is('completion_reminded_at', null).select('id').maybeSingle();
      if (!claimed) return new Response(JSON.stringify({ ok: true, already: true }), { headers: { 'Content-Type': 'application/json' } });
      const sent = await remindCustomer(b);
      if (!sent) {
        // Nothing was delivered (no email, unroutable phone, Twilio/Resend down)
        // → revert so we don't silently start the 48h auto-confirm clock for a
        // customer who was NEVER warned that silence means payment.
        await supabase.from('household_bookings').update({ completion_reminded_at: null }).eq('id', bookingId);
        return new Response(JSON.stringify({ ok: true, reminded: 0, undelivered: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, reminded: 1 }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Cron sweep ──
    const nowIso = new Date().toISOString();
    let reminded = 0, escalated = 0;

    // Stage 0: helper marked 'arrived' but never started (arrival code never
    // entered) for a while — alert admin once so someone can nudge both sides.
    const arrivedCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckArrived } = await supabase.from('household_bookings')
      .select(cols)
      .eq('status', 'arrived')
      .not('paid_at', 'is', null)
      .not('arrived_at', 'is', null)
      .lt('arrived_at', arrivedCutoff)
      .is('completion_escalated_at', null)
      .limit(50) as { data: Booking[] | null };
    for (const b of stuckArrived ?? []) {
      await escalateAdmin(b, 'stuck_arrived');
      await supabase.from('household_bookings').update({ completion_escalated_at: new Date().toISOString() }).eq('id', b.id);
      escalated++;
    }

    // Stage 1: job looks done (helper finished OR timer elapsed) and not yet reminded.
    const { data: toRemind } = await supabase.from('household_bookings')
      .select(cols)
      .eq('status', 'in_progress')
      .not('paid_at', 'is', null)
      .is('completion_reminded_at', null)
      .is('disputed_at', null)
      .or(`helper_finished_at.not.is.null,job_ends_at.lt.${nowIso}`)
      .limit(50) as { data: Booking[] | null };
    for (const b of toRemind ?? []) {
      // Claim first (guarded on null) so an overlapping run / the on-demand path
      // can't double-remind. Revert if nothing was delivered so the 48h
      // auto-confirm clock never starts for an unwarned customer.
      const { data: claimed } = await supabase.from('household_bookings')
        .update({ completion_reminded_at: new Date().toISOString() })
        .eq('id', b.id).is('completion_reminded_at', null).select('id').maybeSingle();
      if (!claimed) continue;
      const sent = await remindCustomer(b);
      if (!sent) {
        await supabase.from('household_bookings').update({ completion_reminded_at: null }).eq('id', b.id);
        continue;
      }
      reminded++;
    }

    // Stage 2: reminded a while ago, still unconfirmed → alert admin once.
    // The stamp is SHARED with Stage 0's stuck-at-arrival alert, so "once"
    // can't be a bare IS NULL check — a booking that already got the arrival
    // alert would then never get THIS one. Instead: escalate when the stamp is
    // missing OR predates the completion reminder (i.e. it was the arrival
    // alert or a previous cycle, not this escalation). Column-to-column
    // comparison isn't expressible in PostgREST, so filter in code.
    const cutoffIso = new Date(Date.now() - ESCALATE_MS).toISOString();
    const { data: toEscalateRaw } = await supabase.from('household_bookings')
      .select(`${cols}, completion_reminded_at, completion_escalated_at`)
      .eq('status', 'in_progress')
      .not('completion_reminded_at', 'is', null)
      .lt('completion_reminded_at', cutoffIso)
      .limit(50) as { data: (Booking & { completion_reminded_at: string; completion_escalated_at: string | null })[] | null };
    const toEscalate = (toEscalateRaw ?? []).filter((b) =>
      !b.completion_escalated_at ||
      new Date(b.completion_escalated_at).getTime() < new Date(b.completion_reminded_at).getTime()
    );
    for (const b of toEscalate) {
      await escalateAdmin(b);
      await supabase.from('household_bookings').update({ completion_escalated_at: new Date().toISOString() }).eq('id', b.id);
      escalated++;
    }

    // Stage 3: still unconfirmed 48h after the reminder → auto-confirm via
    // the internal completion path (same one the customer's "mark complete"
    // and the admin button use, so payout/idempotency/emails stay in ONE
    // place). The reminder warned about this; the money-back guarantee still
    // applies after auto-confirmation. The status flip to 'completed' is the
    // idempotency guard — a completed job never re-enters this query.
    let autoCompleted = 0;
    const autoCutoffIso = new Date(Date.now() - AUTO_COMPLETE_MS).toISOString();
    const { data: toAutoComplete } = await supabase.from('household_bookings')
      .select(cols)
      .eq('status', 'in_progress')
      .not('paid_at', 'is', null)
      .not('completion_reminded_at', 'is', null)
      .is('disputed_at', null)
      .lt('completion_reminded_at', autoCutoffIso)
      .limit(20) as { data: Booking[] | null };
    for (const b of toAutoComplete ?? []) {
      try {
        // Auto-completed (not explicitly customer-confirmed) → hold the payout
        // for a cooling-off window so a late-responding customer can still
        // dispute + get a clean refund before the helper's pay transfers.
        const holdHours = Number(Deno.env.get('AUTO_COMPLETE_HOLD_HOURS')) || 24;
        const resp = await fetch(`${supabaseUrl}/functions/v1/capture-household-payment`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-complete': '1', 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: b.id, hold_hours: holdHours }),
        });
        if (!resp.ok) {
          console.error('[remind-confirm-completion] auto-complete failed', b.id, resp.status, (await resp.text()).slice(0, 200));
          continue;
        }
        await supabase.from('household_job_updates')
          .insert({ booking_id: b.id, status: 'completed', note: 'Auto-confirmed 48h after the completion reminder (no customer response).' })
          .then(() => {}, () => {});
        await sendSms(b.customer_phone, `VANO: we hadn't heard back, so your ${CATEGORY_LABELS[b.category ?? 'other'] ?? 'job'} is now confirmed and your helper has been paid. Anything wrong? WhatsApp +353 89 981 7111 — your money-back guarantee still applies.`);
        autoCompleted++;
      } catch (e) {
        console.error('[remind-confirm-completion] auto-complete threw', b.id, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, reminded, escalated, autoCompleted }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[remind-confirm-completion] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
