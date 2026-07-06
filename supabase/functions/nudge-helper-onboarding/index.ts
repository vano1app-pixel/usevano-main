import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron (hourly) that keeps the helper funnel moving with zero owner effort by
// chasing two silent drop-offs:
//
//   PASS A — payout onboarding: an APPROVED helper who has earned money (a
//     'pending' household_payouts row) but hasn't finished Stripe Connect
//     onboarding (no stripe_account_id, or payouts not enabled). Their earnings
//     are held and nobody prompts them. Send a few escalating "add your bank
//     details, €X is waiting" nudges deep-linking to the Earnings tab.
//
//   PASS B — abandoned application: a PENDING applicant who stalled partway
//     through the three gates (student email OTP / ID check / €2 fee). Send a
//     step-aware "you're almost in — just finish X" nudge to the exact gate.
//
// Both are idempotent + capped via per-helper stamps/counts so nobody is
// spammed and a re-run is safe. WhatsApp-first (SMS fallback) + email.
//
// verify_jwt = false — scheduler/service-key only. Cadence: 30 * * * *.

const MAX_PAYOUT_NUDGES = 4;   // ~ across days at the min-interval below
const MAX_APP_NUDGES    = 3;
const PAYOUT_MIN_HOURS  = 20;  // don't re-nudge the same helper more often
const APP_MIN_HOURS     = 6;
const APP_FIRST_HOURS   = 1;   // only after they've had a chance to finish

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
  const post = (params: Record<string, string>) =>
    fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try { const r = await post({ To: `whatsapp:${e164}`, From: from, Body: body }); if (r.ok) return true; } catch { /* fall through */ }
  }
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const smsFrom = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!smsFrom || smsFrom.startsWith('whatsapp:')) return false;
  try { const r = await post({ To: e164, From: smsFrom, Body: body }); return r.ok; } catch { return false; }
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const resendFrom  = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
  const supabase = createClient(supabaseUrl, serviceKey);
  const now = Date.now();

  const email = async (to: string | null | undefined, subject: string, text: string) => {
    if (!resendKey || !to) return false;
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: resendFrom, to: [to], subject, text }),
      });
      return r.ok;
    } catch { return false; }
  };

  let payoutNudged = 0, appNudged = 0;

  try {
    // ── PASS A: approved helpers with held earnings + no payout setup ────────
    const dashUrl = `${siteUrl}/student-dashboard?tab=earnings`;
    const { data: pendingPayouts } = await supabase
      .from('household_payouts')
      .select('student_id, amount_cents')
      .eq('status', 'pending')
      .limit(500) as { data: Array<{ student_id: string; amount_cents: number }> | null };
    // Sum held € per helper.
    const heldByHelper = new Map<string, number>();
    for (const p of pendingPayouts ?? []) {
      heldByHelper.set(p.student_id, (heldByHelper.get(p.student_id) ?? 0) + (p.amount_cents ?? 0));
    }
    const helperIds = [...heldByHelper.keys()];
    if (helperIds.length) {
      const { data: helpers } = await supabase
        .from('household_helpers')
        .select('id, user_id, name, email, phone, stripe_account_id, stripe_payouts_enabled, payout_onboarding_reminded_at, payout_onboarding_reminder_count')
        .in('user_id', helperIds) as { data: Array<Record<string, unknown>> | null };
      for (const h of helpers ?? []) {
        // Only chase helpers who genuinely can't be paid yet.
        if (h.stripe_account_id && h.stripe_payouts_enabled) continue;
        const count = Number(h.payout_onboarding_reminder_count) || 0;
        if (count >= MAX_PAYOUT_NUDGES) continue;
        const lastMs = h.payout_onboarding_reminded_at ? Date.parse(String(h.payout_onboarding_reminded_at)) : 0;
        if (lastMs && (now - lastMs) < PAYOUT_MIN_HOURS * 3600_000) continue;
        const held = heldByHelper.get(h.user_id as string) ?? 0;
        if (held <= 0) continue;
        const first = String(h.name ?? '').split(' ')[0] || 'there';
        const eur = (held / 100).toFixed(2);
        const msg = `VANO: you've earned €${eur} 🎉 — but we can't pay it out until you add your bank details. It takes 2 minutes: ${dashUrl}`;
        await sendSms(h.phone as string | null, msg);
        await email(h.email as string | null, `You've got €${eur} waiting — add your payout details`, `Hi ${first}, you've earned €${eur} on VANO but it's on hold until you add your bank details (a one-time Stripe setup, ~2 min). Add them here to get paid: ${dashUrl}`);
        await supabase.from('household_helpers')
          .update({ payout_onboarding_reminded_at: new Date(now).toISOString(), payout_onboarding_reminder_count: count + 1 })
          .eq('id', h.id as string);
        payoutNudged++;
      }
    }

    // ── PASS B: pending applicants stalled mid-signup ───────────────────────
    const appFirstCutoff = new Date(now - APP_FIRST_HOURS * 3600_000).toISOString();
    const { data: stalled } = await supabase
      .from('household_helpers')
      .select('id, name, email, phone, student_email_verified, id_verified, signup_paid, application_nudged_at, application_nudge_count, created_at')
      .eq('status', 'pending')
      .lt('created_at', appFirstCutoff)
      .or('student_email_verified.eq.false,id_verified.eq.false,signup_paid.eq.false')
      .order('created_at', { ascending: true })
      .limit(100) as { data: Array<Record<string, unknown>> | null };

    for (const h of stalled ?? []) {
      const count = Number(h.application_nudge_count) || 0;
      if (count >= MAX_APP_NUDGES) continue;
      const lastMs = h.application_nudged_at ? Date.parse(String(h.application_nudged_at)) : 0;
      if (lastMs && (now - lastMs) < APP_MIN_HOURS * 3600_000) continue;

      // Point at the exact gate they're stuck on (email → ID → fee order).
      const verifyUrl = `${siteUrl}/verify-helper?id=${h.id}`;
      const first = String(h.name ?? '').split(' ')[0] || 'there';
      let step: string; let emailBody: string;
      if (!h.student_email_verified) {
        step = `you're almost in — just confirm your student email to keep going`;
        emailBody = `Hi ${first}, your VANO helper application is almost done — the next step is confirming your student email. Pick up where you left off: ${verifyUrl}`;
      } else if (!h.id_verified) {
        step = `you're one quick ID check away from getting approved`;
        emailBody = `Hi ${first}, nice one — your email's confirmed. The last checks are a quick ID verification (2 min) so we can approve you. Finish here: ${verifyUrl}`;
      } else {
        step = `just the €2 sign-up to go and you're live`;
        emailBody = `Hi ${first}, you're nearly there — only the €2 sign-up fee is left and then you can start picking up paid jobs. Finish here: ${verifyUrl}`;
      }
      await sendSms(h.phone as string | null, `VANO: ${step} 👉 ${verifyUrl}`);
      await email(h.email as string | null, `Finish your VANO application — you're almost in`, emailBody);
      await supabase.from('household_helpers')
        .update({ application_nudged_at: new Date(now).toISOString(), application_nudge_count: count + 1 })
        .eq('id', h.id as string);
      appNudged++;
    }

    console.log(`[nudge-helper-onboarding] payoutNudged ${payoutNudged} · appNudged ${appNudged}`);
    return new Response(JSON.stringify({ ok: true, payoutNudged, appNudged }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[nudge-helper-onboarding] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
