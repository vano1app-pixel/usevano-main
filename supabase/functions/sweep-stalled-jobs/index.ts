import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron sweep for the biggest hands-off money hole: a PAID job whose helper
// accepted (status 'accepted' or 'on_way') and then ghosted — never tapped
// arrival. Payment is captured at pay time, so the customer is charged and the
// booking freezes forever: no existing cron touches paid+pre-arrival states
// (remind-unpaid-bookings is gated on paid_at IS NULL, remind-confirm-completion
// only sweeps 'arrived'/'in_progress', redispatch-stale-jobs only 'pending').
//
// Three stages, all idempotent via stamps on the booking row, all keyed off
// paid_at (payment lands right after acceptance, so it's the reliable "clock
// started" signal):
//   A. PING   — paid + accepted/on_way + no progress for PING_MIN → nudge the
//               helper to start; stamp stalled_reminded_at.
//   B. RELEASE— still stuck GRACE_MIN after the ping → free the helper
//               (student_id→NULL, status→pending) KEEPING paid_at, expire open
//               offers, re-dispatch to find someone else; stamp
//               stalled_released_at + clear stalled_reminded_at so the new
//               helper gets a fresh cycle. Runs at most once per booking.
//   C. ESCALATE — released once and STILL unresolved ESCALATE_MIN later (either
//               re-ghosted or never re-filled) → page the owner once so a human
//               can hand-assign or refund; stamp stalled_escalated_at (terminal).
//
// paid_at is preserved throughout: a re-dispatched paid job's next helper
// inherits it, so notify-household-accepted skips creating a second Stripe
// session (it only mints one when !paid_at) — no double charge.
//
// verify_jwt = false — called by the scheduler / internally with the service
// key. Suggested cadence: */15 * * * *.

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff', shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
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

interface Row {
  id: string; status: string; category: string | null; city: string | null;
  student_id: string | null; paid_at: string | null; accepted_at: string | null;
  stalled_reminded_at: string | null; stalled_released_at: string | null; stalled_escalated_at: string | null;
  customer_name: string | null; customer_phone: string | null; customer_email: string | null;
  price_estimate_cents: number | null; scheduled_date: string | null;
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const PING_MIN     = Number(Deno.env.get('STALL_PING_MINUTES'))     || 45;
  const GRACE_MIN    = Number(Deno.env.get('STALL_RELEASE_MINUTES'))  || 90;   // after the ping
  const ESCALATE_MIN = Number(Deno.env.get('STALL_ESCALATE_MINUTES')) || 120;  // after the release
  const now = Date.now();
  const cols = 'id, status, category, city, student_id, paid_at, accepted_at, stalled_reminded_at, stalled_released_at, stalled_escalated_at, customer_name, customer_phone, customer_email, price_estimate_cents, scheduled_date';

  const helperContact = async (studentId: string | null): Promise<{ first: string; phone: string | null }> => {
    if (!studentId) return { first: 'your helper', phone: null };
    const { data } = await supabase.from('household_helpers').select('name, phone').eq('user_id', studentId).maybeSingle() as { data: { name?: string; phone?: string | null } | null };
    return { first: data?.name ? String(data.name).split(' ')[0] : 'your helper', phone: data?.phone ?? null };
  };

  const pageAdmin = (msg: string, subject: string, contactPhone?: string | null) =>
    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, subject, contact_phone: contactPhone ?? undefined }),
    }).catch(() => {});

  let pinged = 0, released = 0, escalated = 0;

  try {
    // ── Stage A: PING — arm the sweep and nudge the helper ──────────────────
    // Clock runs from acceptance (accepted_at), not payment — so a freshly
    // re-accepted replacement helper isn't pinged for the original helper's
    // lateness. Disputed jobs are left alone.
    const pingCutoff = new Date(now - PING_MIN * 60 * 1000).toISOString();
    const { data: toPing } = await supabase.from('household_bookings')
      .select(cols)
      .in('status', ['accepted', 'on_way'])
      .not('paid_at', 'is', null)
      .not('accepted_at', 'is', null)
      .lt('accepted_at', pingCutoff)
      .is('stalled_reminded_at', null)
      .is('disputed_at', null)
      // Don't chase a book-ahead job before its slot: dispatch-scheduled-jobs
      // offers scheduled jobs up to 90 min early, so a helper who accepts a
      // future booking would otherwise be told to "head over now" and release
      // it if they can't — for a job that isn't due yet. Only sweep ASAP jobs
      // (no scheduled_at) or ones whose slot has already passed.
      .or(`scheduled_at.is.null,scheduled_at.lt.${new Date(now).toISOString()}`)
      .limit(50) as { data: Row[] | null };
    for (const b of toPing ?? []) {
      // Claim FIRST (guarded on the stamp still being null) so an overlapping
      // run or a crash-retry can't double-text the helper. Only send if we won.
      const { data: claimed } = await supabase.from('household_bookings')
        .update({ stalled_reminded_at: new Date(now).toISOString() })
        .eq('id', b.id)
        .is('stalled_reminded_at', null)
        .select('id')
        .maybeSingle() as { data: { id: string } | null };
      if (!claimed) continue;
      const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
      const { phone } = await helperContact(b.student_id);
      await sendSms(phone, `VANO: your ${cat} in ${b.city ?? 'Galway'} is paid and waiting — please head over and tap "I've arrived" when you get there. Can't make it? Release it in the app so someone else can take it. — Team VANO`);
      pinged++;
    }

    // ── Stage B: RELEASE — free + re-dispatch once, keeping paid_at ──────────
    const graceCutoff = new Date(now - GRACE_MIN * 60 * 1000).toISOString();
    const { data: toRelease } = await supabase.from('household_bookings')
      .select(cols)
      .in('status', ['accepted', 'on_way'])
      .not('paid_at', 'is', null)
      .not('stalled_reminded_at', 'is', null)
      .lt('stalled_reminded_at', graceCutoff)
      .is('stalled_released_at', null)
      .is('disputed_at', null)
      .limit(30) as { data: Row[] | null };
    for (const b of toRelease ?? []) {
      // Defence-in-depth: only release if the stall ping was fired AT the helper
      // currently on the job — i.e. the ping postdates their acceptance. A ping
      // that predates accepted_at belongs to a previous helper (e.g. one who
      // released and got replaced), so releasing this one would strip a helper
      // who just accepted. (helper_release now clears the stamp, so this is a
      // second guard.)
      if (b.accepted_at && b.stalled_reminded_at && new Date(b.stalled_reminded_at).getTime() < new Date(b.accepted_at).getTime()) {
        await supabase.from('household_bookings').update({ stalled_reminded_at: null }).eq('id', b.id);
        continue;
      }
      const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
      // Free the helper but KEEP paid_at — guarded so a job that advanced to
      // arrived/in_progress/completed between query and now is never touched.
      const { data: freed } = await supabase.from('household_bookings')
        .update({
          student_id: null,
          status: 'pending',
          stalled_released_at: new Date(now).toISOString(),
          stalled_reminded_at: null,
          worker_lat: null,
          worker_lng: null,
          worker_location_updated_at: null,
        })
        .eq('id', b.id)
        .in('status', ['accepted', 'on_way'])
        .not('paid_at', 'is', null)
        .select('id')
        .maybeSingle() as { data: { id: string } | null };
      if (!freed) continue;

      const ghosted = await helperContact(b.student_id);
      if (ghosted.phone) void sendSms(ghosted.phone, `VANO: the ${cat} you accepted has been reassigned since it hadn't started. No action needed — more jobs are waiting in the app.`);

      void supabase.from('household_job_updates').insert({ booking_id: b.id, status: 'cancelled', note: 'Helper released automatically — job was paid but never started. Finding another helper.' });

      // Expire open offers so re-dispatch isn't blocked by its idempotency check.
      await supabase.from('household_job_offers').update({ status: 'expired' }).eq('booking_id', b.id).eq('status', 'pending');

      // Re-dispatch (dispatch re-reads the booking by id, which is now pending).
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ record: { id: b.id }, quiet: false }),
        });
        if (!resp.ok) console.warn('[sweep-stalled] re-dispatch non-2xx', b.id, resp.status, (await resp.text()).slice(0, 160));
      } catch (e) { console.warn('[sweep-stalled] re-dispatch threw', b.id, e); }

      // Keep the customer in the loop (their money is safe, we're re-matching).
      if (b.customer_phone) void sendSms(b.customer_phone, `VANO: your helper couldn't make your ${cat}, so we're finding you another one now — no charge changes, you're still covered. Track it here: ${(Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '')}/track/${b.id}`);
      void pageAdmin(`♻️ *Paid job re-dispatched* — a helper ghosted a paid ${cat} in ${b.city ?? 'Galway'}. Auto-released + re-dispatched; customer notified. Ref ${b.id.slice(-8).toUpperCase()}`, `♻️ Paid job re-dispatched — ${cat}`, b.customer_phone);
      released++;
    }

    // ── Stage C: ESCALATE — released once, still unresolved → page owner ─────
    // Escalate only jobs still genuinely stuck after a release — a fresh
    // re-acceptance (recent accepted_at) is working fine, so exclude it; a job
    // that stayed 'pending' (nobody re-took it) still escalates.
    const escalateCutoff = new Date(now - ESCALATE_MIN * 60 * 1000).toISOString();
    const { data: toEscalate } = await supabase.from('household_bookings')
      .select(cols)
      .in('status', ['accepted', 'on_way', 'pending'])
      .not('paid_at', 'is', null)
      .not('stalled_released_at', 'is', null)
      .lt('stalled_released_at', escalateCutoff)
      .is('stalled_escalated_at', null)
      .is('disputed_at', null)
      .or(`status.eq.pending,accepted_at.lt.${escalateCutoff}`)
      .limit(30) as { data: Row[] | null };
    for (const b of toEscalate ?? []) {
      const { data: marked } = await supabase.from('household_bookings')
        .update({ stalled_escalated_at: new Date(now).toISOString() })
        .eq('id', b.id)
        .is('stalled_escalated_at', null)
        .select('id')
        .maybeSingle() as { data: { id: string } | null };
      if (!marked) continue;
      const cat = CATEGORY_LABELS[b.category ?? 'other'] ?? 'job';
      const contact = `${b.customer_name ?? '—'}, ${b.customer_phone ?? '—'}, ${b.customer_email ?? '—'}`;
      void pageAdmin(
        `🚨 *Paid job still stuck* (${b.id.slice(-8).toUpperCase()})\nA paid ${cat} in ${b.city ?? 'Galway'} was auto-released but still hasn't been picked up/started. Please hand-assign a helper or refund.\nCustomer: ${contact}\nTrack: ${(Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '')}/track/${b.id}`,
        `🚨 Paid job stuck — needs you (${cat})`,
        b.customer_phone,
      );
      escalated++;
    }

    console.log(`[sweep-stalled] pinged ${pinged} · released ${released} · escalated ${escalated}`);
    return new Response(JSON.stringify({ ok: true, pinged, released, escalated }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[sweep-stalled-jobs] unhandled', err);
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
