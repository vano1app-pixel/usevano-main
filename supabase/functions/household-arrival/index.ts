import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTimedCategory, bookedDurationMinutes } from "../_shared/householdJob.ts";
import { sendHouseholdPush } from "../_shared/householdPush.ts";

// Arrival-code handshake for the household flow.
//
// When a helper taps "I've reached" on their job screen we generate a random
// 4-digit code (action 'request') and store it on the booking — but we NEVER
// return it to the helper's app. The code surfaces only on the customer's
// tracking screen. The helper reads it from the customer and types it back in
// (action 'verify'); a match starts the job. That's the proof-of-arrival: a
// helper can't advance the job without physically being in front of the
// customer's screen.
//
// Auth: the caller must be the assigned helper (booking.student_id). Generation
// and comparison run here under the service role so the code stays out of the
// helper's reach (the helper's client deliberately does not select it).

const FALLBACK_ORIGINS = ['https://vanojobs.com', 'https://www.vanojobs.com', 'http://localhost:5173', 'http://localhost:4173'];
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost']; // iOS / Android / legacy shells — always allowed (see capacitor.config.ts)
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const allowed = [...(list.length ? list : FALLBACK_ORIGINS), ...NATIVE_APP_ORIGINS];
  if (allowed.includes(n)) return n;
  try { if (new URL(n).hostname.endsWith('-vano1app-pixels-projects.vercel.app')) return n; } catch { /* not a URL */ }
  return null;
}
function buildCorsHeaders(req: Request) {
  return { 'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null', 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function isOriginAllowed(req: Request) { return !req.headers.get('Origin') || matchOrigin(req) !== null; }

// ── Pocket channel (WhatsApp-first, SMS fallback) ─────────────────────────
// Arrival used to be web-push-only, but push doesn't reach an iPhone customer
// in a Safari tab — and this is the one moment the customer MUST act (read
// out the 4-digit start code) or the helper is stuck at the door. Same
// Twilio pattern as notify-household-on-way.
function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}
async function sendPocketMessage(to: string | null | undefined, body: string): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const fromWa = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try {
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: `whatsapp:${e164}`, From: fromWa, Body: body }).toString(),
      });
      if (!resp.ok) console.warn('[arrival:whatsapp] twilio error', resp.status, (await resp.text()).slice(0, 200));
      return resp.ok;
    } catch (e) { console.warn('[arrival:whatsapp] twilio exception', e); return false; }
  }
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const fromSms = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!fromSms || fromSms.startsWith('whatsapp:')) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: e164, From: fromSms, Body: body }).toString(),
    });
    if (!resp.ok) console.warn('[arrival:sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
    return resp.ok;
  } catch (e) { console.warn('[arrival:sms] twilio exception', e); return false; }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) => json(status, { error });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return bad(401, 'Unauthorized');
    const callerId = user.id;

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    const action = (body?.action === 'verify' || body?.action === 'finished' || body?.action === 'start_without_code')
      ? body.action : 'request';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, paid_at, price_estimate_cents, arrival_code, arrival_verified_at, category, booking_data, arrival_attempts, customer_name, customer_phone')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; student_id: string | null; status: string; paid_at: string | null; price_estimate_cents: number | null; arrival_code: string | null; arrival_verified_at: string | null; category: string; booking_data: Record<string, unknown> | null; arrival_attempts: number | null; customer_name: string | null; customer_phone: string | null } | null; error: unknown };

    if (fetchErr || !booking) return bad(404, 'Booking not found');
    if (booking.student_id !== callerId) return bad(403, 'Not the assigned helper');

    // Pay-before-start gate, ENFORCED SERVER-SIDE. StudentJobDetail hides the
    // arrival buttons until paid_at is set, but that's client-only: a helper
    // bypassing their UI could drive request→start_without_code and push an
    // UNPAID job to in_progress — a state no unpaid sweep covers, so it would
    // sit unpaid forever. Block every forward-moving arrival action until paid.
    // ('finished' is allowed through — a paid job that somehow reached here
    // should still be completable; the checks above already require assignment.)
    const advancingActions = ['request', 'verify', 'start_without_code'];
    if (advancingActions.includes(action) && ((booking.price_estimate_cents ?? 0) > 0) && !booking.paid_at) {
      return bad(409, 'This job can be started once the customer has paid.');
    }

    if (action === 'request') {
      // Helper just tapped "I've reached". Generate the code and move the job
      // to 'arrived' so the customer's screen reveals it. Idempotent: if the
      // job is already at 'arrived' awaiting the code, keep the existing one.
      if (!['accepted', 'on_way', 'arrived'].includes(booking.status)) {
        return bad(409, `Cannot mark arrival in status: ${booking.status}`);
      }

      // Always (re)generate a fresh code and reset the attempt counter +
      // arrived_at. Re-tapping is also the unlock path after too many wrong
      // code guesses (see the verify branch below).
      const newCode = String(Math.floor(1000 + Math.random() * 9000));
      const { error: updErr } = await supabase
        .from('household_bookings')
        .update({ arrival_code: newCode, arrival_verified_at: null, status: 'arrived', arrival_attempts: 0, arrived_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('student_id', callerId)
        .in('status', ['accepted', 'on_way', 'arrived']);
      if (updErr) { console.error('[household-arrival] request update failed', updErr); return bad(500, 'Could not mark arrival'); }

      await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'arrived', note: 'Helper reached the address — awaiting arrival code.' });

      // Best-effort web push + pocket message to the customer — only on the
      // first arrival, not on a code re-request (status already 'arrived').
      // The WhatsApp/SMS matters: push doesn't reach iPhone Safari tabs, and
      // without the tracking link the customer never sees the start code and
      // the helper is stuck at the door. Never blocks the flow.
      if (booking.status !== 'arrived') {
        void sendHouseholdPush(bookingId, 'arrived');
        const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
        void sendPocketMessage(
          booking.customer_phone,
          `👋 Your VANO helper is at the door! Open your booking to get the 4-digit start code and read it out to them: ${siteUrl}/track/${bookingId}`,
        );
      }

      return json(200, { ok: true, status: 'arrived' });
    }

    if (action === 'finished') {
      // Helper says they're done. This does NOT complete or pay — it flags the
      // job so the customer is asked to confirm (and lets a timed job be
      // confirmed before its timer ends). Only valid once the job has started.
      if (booking.status !== 'in_progress') {
        return bad(409, `Can only mark finished once the job has started (status: ${booking.status})`);
      }
      await supabase
        .from('household_bookings')
        .update({ helper_finished_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('student_id', callerId)
        .eq('status', 'in_progress');
      // Ping the customer to confirm now (best-effort; the cron also nudges).
      fetch(`${supabaseUrl}/functions/v1/remind-confirm-completion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      }).catch(() => {});
      return json(200, { ok: true, status: 'in_progress', helper_finished: true });
    }

    if (action === 'start_without_code') {
      // "Customer not available" — the helper is at the address but can't reach
      // the customer to read out the arrival code. They start the job without
      // the proof-of-presence handshake. Guards mirror 'verify': must be at
      // 'arrived' (they tapped "I've reached" first) and not already verified.
      if (booking.arrival_verified_at) {
        return json(200, { ok: true, verified: false, started: true, status: 'in_progress', job_ends_at: null });
      }
      if (booking.status !== 'arrived') return bad(409, `Can only start without code from 'arrived' (status: ${booking.status})`);

      const nowMs = Date.now();
      const mins = isTimedCategory(booking.category) ? bookedDurationMinutes(booking.category, booking.booking_data) : null;
      const jobEndsAt = mins ? new Date(nowMs + mins * 60_000).toISOString() : null;

      const { error: startErr } = await supabase
        .from('household_bookings')
        .update({ arrival_verified_at: new Date(nowMs).toISOString(), status: 'in_progress', job_ends_at: jobEndsAt, arrival_skipped: true, arrival_attempts: 0 })
        .eq('id', bookingId)
        .eq('student_id', callerId)
        .eq('status', 'arrived');
      if (startErr) { console.error('[household-arrival] start_without_code update failed', startErr); return bad(500, 'Could not start job'); }

      await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'in_progress', note: 'Started without arrival code — customer not present.' });

      // Customer: the 'arrived' push already fired when they tapped "I've
      // reached"; reuse it so the tracking screen surfaces the change. Best-effort.
      void sendHouseholdPush(bookingId, 'arrived');

      // Admin: flag the unverified start so the owner can keep an eye on it.
      // Best-effort — never block the helper's flow on the alert.
      const catLabel = booking.category ?? 'job';
      const ref = bookingId.slice(-8).toUpperCase();
      void fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'arrival_unverified',
          booking_id: bookingId,
          category: catLabel,
          customer_name: booking.customer_name ?? '',
          message: `⚠️ *Started without arrival code* (${ref})\n${catLabel} for ${booking.customer_name ?? 'customer'} — helper reported the customer wasn't present and started the job without the 4-digit code.`,
          subject: `⚠️ Job started without arrival code — ${catLabel} — ${ref}`,
        }),
      }).catch(() => {});

      return json(200, { ok: true, verified: false, started: true, status: 'in_progress', job_ends_at: jobEndsAt });
    }

    // action === 'verify'
    if (booking.arrival_verified_at) return json(200, { ok: true, verified: true, status: 'in_progress' });
    if (booking.status !== 'arrived' || !booking.arrival_code) return bad(409, 'No arrival code to verify yet');

    // Anti-brute-force: the 4-digit code is the proof-of-presence, so cap wrong
    // guesses. After 5 misses we lock verification; the helper taps "I've
    // reached" again to issue a fresh code (which resets this counter).
    const attempts = booking.arrival_attempts ?? 0;
    if (attempts >= 5) return json(200, { ok: true, verified: false, locked: true });
    if (!/^\d{4}$/.test(code) || code !== booking.arrival_code) {
      const nextAttempts = attempts + 1;
      await supabase.from('household_bookings').update({ arrival_attempts: nextAttempts }).eq('id', bookingId).eq('student_id', callerId);
      return json(200, { ok: true, verified: false, locked: nextAttempts >= 5 });
    }

    // Timed jobs get a job_ends_at so the screens can show a countdown. The job
    // is NEVER auto-completed — the customer must mark it complete to pay the
    // helper. The timer is just a guide for both sides.
    const nowMs = Date.now();
    const mins = isTimedCategory(booking.category) ? bookedDurationMinutes(booking.category, booking.booking_data) : null;
    const jobEndsAt = mins ? new Date(nowMs + mins * 60_000).toISOString() : null;

    const { error: verifyErr } = await supabase
      .from('household_bookings')
      .update({ arrival_verified_at: new Date(nowMs).toISOString(), status: 'in_progress', job_ends_at: jobEndsAt, arrival_attempts: 0 })
      .eq('id', bookingId)
      .eq('student_id', callerId)
      .eq('status', 'arrived');
    if (verifyErr) { console.error('[household-arrival] verify update failed', verifyErr); return bad(500, 'Could not confirm code'); }

    await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'in_progress', note: 'Arrival code confirmed — job started.' });
    return json(200, { ok: true, verified: true, status: 'in_progress', job_ends_at: jobEndsAt });
  } catch (err) {
    console.error('[household-arrival] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
