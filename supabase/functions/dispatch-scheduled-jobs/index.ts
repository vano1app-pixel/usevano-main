import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron (every 5 min) for book-ahead jobs. create-household-payment-checkout
// stores a real scheduled_at and does NOT dispatch a future-dated job at
// creation. This owns two things:
//
//   PASS A — dispatch when due: a pending, unassigned, future-dated job whose
//     start is now within LEAD_MIN gets fanned out to helpers (via
//     dispatch-household-job), so it's offered close to the slot instead of
//     days early. Idempotent: dispatch stamps last_dispatched_at, so a job is
//     only picked up here once.
//
//   PASS B — pre-start reminder: an assigned job (helper accepted) starting
//     within REMIND_MIN gets a nudge to the helper so they don't forget.
//     Stamped via scheduled_reminded_at.
//
// verify_jwt = false — scheduler/service-key only. Cadence: */5 * * * *.

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help', other: 'General help',
};

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
  const supabase = createClient(supabaseUrl, serviceKey);

  const LEAD_MIN   = Number(Deno.env.get('SCHEDULED_LEAD_MINUTES'))   || 90;
  const REMIND_MIN = Number(Deno.env.get('SCHEDULED_REMIND_MINUTES')) || 45;
  const now = Date.now();

  let dispatched = 0, reminded = 0;

  try {
    // ── PASS A: dispatch (and RE-dispatch) jobs in their lead window ────────
    // Due = scheduled between 30 min past the slot and LEAD_MIN ahead. We call
    // dispatch every run (not just once): dispatch-household-job expires stale
    // offers and skips while live offers exist, so this re-offers an unaccepted
    // book-ahead job as its offers lapse — the same second-chance an ASAP job
    // gets from redispatch-stale-jobs (which deliberately skips future-dated
    // jobs). Bounded to slot+30min so a passed slot stops re-offering.
    const leadCutoff = new Date(now + LEAD_MIN * 60 * 1000).toISOString();
    const slotFloor  = new Date(now - 30 * 60 * 1000).toISOString();
    const { data: due } = await supabase
      .from('household_bookings')
      .select('id, city, category, price_estimate_cents, scheduled_at, last_dispatched_at')
      .eq('status', 'pending')
      .is('student_id', null)
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', leadCutoff)
      .gte('scheduled_at', slotFloor)
      .order('scheduled_at', { ascending: true })
      .limit(30) as { data: Array<Record<string, unknown>> | null };

    for (const b of due ?? []) {
      try {
        // First attempt is LOUD (customer + owner notifications); every later
        // run inside the dispatch window is QUIET — without this, a scheduled
        // booking with no matching helpers emailed the customer "we're on it"
        // and paged the owner on EVERY 5-minute run for the whole window.
        // dispatch stamps last_dispatched_at on each attempt, so its presence
        // means this is a repeat round.
        const quiet = !!b.last_dispatched_at;
        const resp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: { id: b.id, status: 'pending', city: b.city, category: b.category, price_estimate_cents: b.price_estimate_cents }, quiet }),
        });
        if (resp.ok) dispatched++;
        else console.warn('[dispatch-scheduled] dispatch non-2xx', b.id, resp.status, (await resp.text()).slice(0, 160));
      } catch (e) { console.warn('[dispatch-scheduled] dispatch threw', b.id, e); }
    }

    // ── PASS B: remind the assigned helper shortly before start ─────────────
    const remindCutoff = new Date(now + REMIND_MIN * 60 * 1000).toISOString();
    const { data: soon } = await supabase
      .from('household_bookings')
      .select('id, category, city, student_id, scheduled_at, scheduled_reminded_at')
      .in('status', ['accepted', 'on_way'])
      .not('student_id', 'is', null)
      .not('scheduled_at', 'is', null)
      .is('scheduled_reminded_at', null)
      .lte('scheduled_at', remindCutoff)
      .gte('scheduled_at', new Date(now - 30 * 60 * 1000).toISOString())
      .limit(50) as { data: Array<Record<string, unknown>> | null };

    for (const b of soon ?? []) {
      // Claim the reminder atomically FIRST (conditional on it still being
      // null) so two overlapping runs can't both text the helper.
      const { data: claimed } = await supabase.from('household_bookings')
        .update({ scheduled_reminded_at: new Date(now).toISOString() })
        .eq('id', b.id as string)
        .is('scheduled_reminded_at', null)
        .select('id')
        .maybeSingle();
      if (!claimed) continue;
      const { data: helper } = await supabase.from('household_helpers').select('name, phone').eq('user_id', b.student_id as string).maybeSingle() as { data: { name?: string; phone?: string | null } | null };
      const cat = CATEGORY_LABELS[b.category as string] ?? 'job';
      const whenLocal = new Date(String(b.scheduled_at)).toLocaleTimeString('en-IE', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Dublin' });
      await sendSms(helper?.phone, `VANO reminder: your ${cat} in ${b.city ?? 'Galway'} starts around ${whenLocal}. Head over in good time and tap "I've arrived" when you get there.`);
      reminded++;
    }

    console.log(`[dispatch-scheduled] dispatched ${dispatched} · reminded ${reminded}`);
    return new Response(JSON.stringify({ ok: true, dispatched, reminded }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[dispatch-scheduled-jobs] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
