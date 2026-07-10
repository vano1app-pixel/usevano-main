import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Daily cron: "need a hand again?" nudge for dormant household customers —
// people whose LAST booking completed weeks ago and who never came back.
// One-off customers otherwise never hear from us again; this is the only
// winback touch in the lifecycle.
//
// Cadence is category-timed (a dog walk goes stale faster than a gutter
// clean) and every customer gets AT MOST ONE nudge per booking cycle: the
// candidate booking row is stamped winback_sent_at once handled (sent,
// unreachable, or too stale), same close-out pattern as
// remind-household-rating. If they book again, that new booking is a fresh
// unstamped cycle, so a regular-but-infrequent customer can be nudged again
// months later — but never twice for the same lapse.
//
// Schedule (pg_cron): 0 11 * * *  → POST /functions/v1/household-winback
// (11:00 UTC ≈ Irish lunchtime — see 20260705100000_household_winback.sql)

const DAY_MS = 24 * 60 * 60 * 1000;

// How long after a completed booking the customer counts as "due another".
// Keyed on the booking's category; anything unknown gets the default.
const CADENCE_DAYS: Record<string, number> = {
  'dog-walk': 14, 'dog-walking': 14,
  cleaning: 21, 'outdoor-cleaning': 28,
  shopping: 21, 'grocery-shopping': 21,
  garden: 28, 'lawn-mowing': 28,
};
const DEFAULT_CADENCE_DAYS = 35;
// Older than this and a nudge reads as "who is this?" — close out silently.
const STALE_DAYS = 120;
// Safety cap per run so a backlog can't burst-message half of Galway at once.
const MAX_SENDS_PER_RUN = 25;

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'laundry', 'dog-walk': 'dog walk', garden: 'garden help',
  moving: 'moving help', cleaning: 'clean', tutoring: 'tutoring session',
  'grocery-shopping': 'grocery run', 'dog-walking': 'dog walk',
  'lawn-mowing': 'lawn mow', 'moving-help': 'moving help',
  'outdoor-cleaning': 'outdoor clean', 'tutoring-grinds': 'tutoring session',
  other: 'job',
};

// Same normalization as the send paths — used only to group two typed
// formats of the same number into one customer, never to rewrite data.
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

// WhatsApp-preferred send, SMS fallback — identical gating to
// notify-household-accepted so the winback can never reach someone the
// transactional messages couldn't.
async function sendSms(to: string | null | undefined, body: string): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try {
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `whatsapp:${e164}`, From: from, Body: body }).toString(),
      });
      if (!resp.ok) console.warn('[winback whatsapp] twilio error', resp.status, (await resp.text()).slice(0, 200));
      return resp.ok;
    } catch (e) {
      console.warn('[winback whatsapp] twilio exception', e);
      return false;
    }
  }
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const from = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!from || from.startsWith('whatsapp:')) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
    });
    if (!resp.ok) console.warn('[winback sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
    return resp.ok;
  } catch (e) {
    console.warn('[winback sms] twilio exception', e);
    return false;
  }
}

interface BookingRow {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  category: string | null;
  status: string;
  created_at: string;
  winback_sent_at: string | null;
  paid_at: string | null;
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);
  const now = Date.now();

  // Everything each customer did in the look-back window, oldest first.
  // Small enough at current volume to reason about in one pass; the limit is
  // a guard, not pagination — a run that hits it just picks up the rest on
  // the next day's firing.
  const { data: rows, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_phone, customer_email, category, status, created_at, winback_sent_at, paid_at')
    .gte('created_at', new Date(now - STALE_DAYS * DAY_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(1000);

  if (error) {
    console.error('[winback] query error', error);
    return new Response('DB error', { status: 500 });
  }

  // Group by customer (normalized phone, falling back to the raw string so a
  // weird format still groups with itself).
  const byCustomer = new Map<string, BookingRow[]>();
  for (const b of (rows ?? []) as BookingRow[]) {
    if (!b.customer_phone) continue;
    const key = normalizeIrishPhone(b.customer_phone) ?? b.customer_phone.trim();
    const list = byCustomer.get(key) ?? [];
    list.push(b);
    byCustomer.set(key, list);
  }

  let sent = 0;
  const closeOut: string[] = []; // stamp handled without (or after) sending

  for (const bookings of byCustomer.values()) {
    if (sent >= MAX_SENDS_PER_RUN) break;

    const latest = bookings[bookings.length - 1];
    // Any live or recent booking means they're not dormant — nothing to do.
    // (Autopilot visits land here as bookings too, so subscribers are skipped.)
    if (latest.status !== 'completed' && latest.status !== 'cancelled') continue;

    // The candidate is their most recent completed, paid booking.
    const candidate = [...bookings].reverse().find(b => b.status === 'completed' && b.paid_at);
    if (!candidate) continue;
    if (candidate.winback_sent_at) continue; // this lapse was already handled

    const ageDays = (now - new Date(candidate.created_at).getTime()) / DAY_MS;
    const cadence = CADENCE_DAYS[candidate.category ?? ''] ?? DEFAULT_CADENCE_DAYS;
    if (ageDays < cadence) continue;              // not due yet — later run
    if (ageDays > STALE_DAYS) { closeOut.push(candidate.id); continue; }
    // They came back after the candidate (e.g. a later booking that was
    // cancelled still shows intent) — don't guilt-trip, close out quietly.
    if (latest.id !== candidate.id) { closeOut.push(candidate.id); continue; }

    const catLabel = CATEGORY_LABELS[candidate.category ?? 'other'] ?? 'job';
    const custName = candidate.customer_name && candidate.customer_name !== 'Guest'
      ? candidate.customer_name : 'there';

    // Always use the generic, ALWAYS-TRUE hook. We deliberately DON'T promise
    // "your next booking is 50% off": winback only sees a 120-day window and
    // groups by normalized phone, whereas checkout counts PAID bookings over
    // the customer's lifetime keyed on the exact phone string. Those two counts
    // disagree, so a specific "next one is half price" promise here would be
    // charged in full at checkout — a broken promise. The evergreen "every 3rd
    // booking is 50% off" is correct no matter what the real count is.
    const hook = 'every 3rd booking is 50% off';

    const smsBody =
      `VANO: it's been a few weeks since your last ${catLabel} — need a hand again? ` +
      `Book an ID-verified student in 30 seconds: ${siteUrl} — ${hook}. Reply STOP to opt out.`;

    // Claim BEFORE sending (guarded on the stamp still being null) so a crash
    // partway through the run can't re-blast marketing SMS on the next firing —
    // the double-send that gets a sender number reported as spam.
    const { data: claimed } = await supabase
      .from('household_bookings')
      .update({ winback_sent_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .is('winback_sent_at', null)
      .select('id')
      .maybeSingle() as { data: { id: string } | null };
    if (!claimed) continue; // another run already handled this lapse

    const delivered = await sendSms(candidate.customer_phone, smsBody);

    let emailed = false;
    if (!delivered && candidate.customer_email && resendKey) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      It's been a few weeks since your last <strong>${catLabel}</strong> — need a hand again?
      Same-day, ID-verified student helpers, booked in about 30 seconds.
    </p>
    <p style="margin:0 0 20px;color:#4a7c59;font-size:13px;font-weight:600;">💚 Every 3rd booking is 50% off.</p>
    <a href="${siteUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;">Book a helper →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">You're getting this because you booked with VANO — we only send it once. Questions? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#9ca3af;">+353 89 981 7111</a></p>
  </div>
</div>
</body></html>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [candidate.customer_email],
          subject: 'Need a hand again? — VANO',
          html,
          text: `Hi ${custName}, it's been a few weeks since your last ${catLabel} — need a hand again? Book an ID-verified student in 30 seconds: ${siteUrl} — ${hook}. We only send this once.`,
        }),
      });
      if (!res.ok) console.warn('[winback] Resend error', res.status, await res.text());
      emailed = res.ok;
    }

    // Already stamped by the claim above (handled either way: sent, or
    // unreachable on every channel — retrying an unreachable customer daily
    // would just burn the run cap).
    if (delivered || emailed) sent++;
  }

  if (closeOut.length > 0) {
    await supabase
      .from('household_bookings')
      .update({ winback_sent_at: new Date().toISOString() })
      .in('id', closeOut);
  }

  return new Response(JSON.stringify({ ok: true, sent, closed: closeOut.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
