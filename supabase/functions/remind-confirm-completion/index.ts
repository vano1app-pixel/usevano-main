import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Human-in-the-loop net for jobs awaiting the customer's "mark complete".
// We never auto-pay, so this nudges instead:
//   1. Remind the customer to confirm (once) when the job looks done — i.e. the
//      helper tapped "I've finished" or a timed job's clock ran out.
//   2. If still unconfirmed a while later, alert an admin to follow up (once).
// Nothing here moves money — payout still only happens when the customer taps
// "mark complete". Only PAID jobs are nudged (unpaid ones are chased by the
// separate unpaid-booking reminders).
//
// Two modes:
//   POST { booking_id }  → remind that one customer now (called by
//                          household-arrival when the helper marks finished).
//   POST {}              → cron sweep (suggested cadence: every 15–30 min).
//
// verify_jwt = false — called by the scheduler / internally with the service key.

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

const ESCALATE_MS = 12 * 60 * 60 * 1000; // alert admin 12h after the customer reminder

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
  const remindCustomer = async (b: Booking): Promise<boolean> => {
    const helper = await helperFirstName(b.student_id);
    const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
    const custName = b.customer_name || 'there';
    const trackUrl = `${siteUrl}/track/${b.id}`;
    let ok = false;

    if (resendKey && b.customer_email) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;"><p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Is your job all done?</p></div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;"><strong>${helper}</strong> has wrapped up your <strong>${cat}</strong>. Tap below to confirm it's done — that's what releases their payment.</p>
    <a href="${trackUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Confirm &amp; pay ${helper} →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Not done yet, or a problem? WhatsApp us: +353 89 981 7111</p>
  </div>
</div></body></html>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [b.customer_email], subject: `Confirm your ${cat} is done — VANO`, html, text: `Hi ${custName}, ${helper} has finished your ${cat}. Confirm it's done to release their payment: ${trackUrl} — Problem? WhatsApp +353 89 981 7111` }),
      });
      ok = res.ok || ok;
    }
    const sms = await sendSms(b.customer_phone, `VANO: ${helper} has finished your ${cat}. Confirm it's done to release their payment: ${trackUrl}`);
    return ok || sms;
  };

  const escalateAdmin = async (b: Booking): Promise<boolean> => {
    if (!resendKey || !adminEmail) return false;
    const helper = await helperFirstName(b.student_id);
    const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
    const ref = b.id.slice(-8).toUpperCase();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [adminEmail], subject: `⏳ Unconfirmed job — follow up (${ref})`, text: `${helper} marked a ${cat} finished but the customer (${b.customer_name ?? '—'}, ${b.customer_phone ?? '—'}, ${b.customer_email ?? '—'}) hasn't confirmed after the reminder.\nThe helper is unpaid until it's confirmed.\nFollow up / mark complete: ${siteUrl}/track/${b.id}\nRef: ${ref}` }),
    });
    return res.ok;
  };

  const cols = 'id, status, paid_at, customer_name, customer_email, customer_phone, category, student_id';

  try {
    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;

    // ── On-demand: remind one customer now (helper just tapped finished) ──
    if (bookingId) {
      const { data: b } = await supabase.from('household_bookings')
        .select(`${cols}, completion_reminded_at`).eq('id', bookingId).maybeSingle() as { data: (Booking & { completion_reminded_at: string | null }) | null };
      if (!b || b.status !== 'in_progress' || !b.paid_at) return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: { 'Content-Type': 'application/json' } });
      if (b.completion_reminded_at) return new Response(JSON.stringify({ ok: true, already: true }), { headers: { 'Content-Type': 'application/json' } });
      await remindCustomer(b);
      await supabase.from('household_bookings').update({ completion_reminded_at: new Date().toISOString() }).eq('id', bookingId);
      return new Response(JSON.stringify({ ok: true, reminded: 1 }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── Cron sweep ──
    const nowIso = new Date().toISOString();
    let reminded = 0, escalated = 0;

    // Stage 1: job looks done (helper finished OR timer elapsed) and not yet reminded.
    const { data: toRemind } = await supabase.from('household_bookings')
      .select(cols)
      .eq('status', 'in_progress')
      .not('paid_at', 'is', null)
      .is('completion_reminded_at', null)
      .or(`helper_finished_at.not.is.null,job_ends_at.lt.${nowIso}`)
      .limit(50) as { data: Booking[] | null };
    for (const b of toRemind ?? []) {
      await remindCustomer(b);
      await supabase.from('household_bookings').update({ completion_reminded_at: new Date().toISOString() }).eq('id', b.id);
      reminded++;
    }

    // Stage 2: reminded a while ago, still unconfirmed → alert admin once.
    const cutoffIso = new Date(Date.now() - ESCALATE_MS).toISOString();
    const { data: toEscalate } = await supabase.from('household_bookings')
      .select(cols)
      .eq('status', 'in_progress')
      .not('completion_reminded_at', 'is', null)
      .lt('completion_reminded_at', cutoffIso)
      .is('completion_escalated_at', null)
      .limit(50) as { data: Booking[] | null };
    for (const b of toEscalate ?? []) {
      await escalateAdmin(b);
      await supabase.from('household_bookings').update({ completion_escalated_at: new Date().toISOString() }).eq('id', b.id);
      escalated++;
    }

    return new Response(JSON.stringify({ ok: true, reminded, escalated }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[remind-confirm-completion] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500 });
  }
});
