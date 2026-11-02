import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isReviewDemoBooking } from "../_shared/reviewDemo.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTimedCategory, bookedDurationMinutes } from "../_shared/householdJob.ts";
import { sendHouseholdPush } from "../_shared/householdPush.ts";
import { canRequestExtraTime, extraTimeText, pendingExtraTime, type ExtraTimeState } from "../_shared/extraTime.ts";

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
// Great-circle distance in metres — used by the GPS-verified arrival path.
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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
    const action = (body?.action === 'verify' || body?.action === 'finished' || body?.action === 'start_without_code'
      || body?.action === 'confirm_paid' || body?.action === 'report_unpaid' || body?.action === 'start_gps'
      || body?.action === 'sos' || body?.action === 'sos_safe'
      || body?.action === 'request_extra_time' || body?.action === 'cancel_extra_time')
      ? body.action : 'request';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, paid_at, price_estimate_cents, arrival_code, arrival_verified_at, category, booking_data, arrival_attempts, customer_name, customer_phone, customer_address, customer_lat, customer_lng, worker_lat, worker_lng')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; student_id: string | null; status: string; paid_at: string | null; price_estimate_cents: number | null; arrival_code: string | null; arrival_verified_at: string | null; category: string; booking_data: Record<string, unknown> | null; arrival_attempts: number | null; customer_name: string | null; customer_phone: string | null; customer_address: string | null; customer_lat: number | null; customer_lng: number | null; worker_lat: number | null; worker_lng: number | null } | null; error: unknown };

    if (fetchErr || !booking) return bad(404, 'Booking not found');
    if (booking.student_id !== callerId) return bad(403, 'Not the assigned helper');
    // App Store review demo: every status write below happens, every call to
    // Twilio / Resend / push / the owner's WhatsApp is skipped.
    const demo = isReviewDemoBooking(booking.booking_data);

    // The arrival code lives in the service-role-only household_booking_secrets
    // table (never on the booking row, so the assigned helper can't read it via
    // PostgREST or realtime). Read it here for the server-side compare; the
    // helper only ever submits a guess, never sees the value.
    const { data: secretRow } = await supabase
      .from('household_booking_secrets')
      .select('arrival_code')
      .eq('booking_id', bookingId)
      .maybeSingle() as { data: { arrival_code: string | null } | null };
    const arrivalCode = secretRow?.arrival_code ?? null;

    // Pay-before-start gate, ENFORCED SERVER-SIDE. StudentJobDetail hides the
    // arrival buttons until paid_at is set, but that's client-only: a helper
    // bypassing their UI could drive request→start_without_code and push an
    // UNPAID job to in_progress — a state no unpaid sweep covers, so it would
    // sit unpaid forever. Block every forward-moving arrival action until paid.
    // ('finished' is allowed through — a paid job that somehow reached here
    // should still be completable; the checks above already require assignment.)
    const advancingActions = ['request', 'verify', 'start_without_code', 'start_gps'];
    if (advancingActions.includes(action) && ((booking.price_estimate_cents ?? 0) > 0) && !booking.paid_at) {
      return bad(409, 'This job can be started once the customer has paid.');
    }

    if (action === 'sos' || action === 'sos_safe') {
      // ── Helper SOS (the panic button) ───────────────────────────────────
      // Deliberately NO status gate: an emergency button that 409s because a
      // cancel/complete raced it is exactly the wrong failure mode. The only
      // gate is the one that matters — the caller is the booking's assigned
      // helper (checked above). Nothing here is ever surfaced to the
      // customer (no job_updates row, no booking_data stamp): the customer
      // may be the reason the button was pressed.
      let helperName = 'A helper';
      let helperPhone: string | null = null;
      const { data: sosHelper } = await supabase
        .from('household_helpers').select('name, phone').eq('user_id', callerId).maybeSingle() as { data: { name?: string | null; phone?: string | null } | null };
      if (sosHelper?.name) helperName = sosHelper.name;
      if (sosHelper?.phone) helperPhone = sosHelper.phone;

      if (action === 'sos_safe') {
        // "I'm safe now" — resolve every active event on this booking and
        // send the all-clear (best-effort; the resolve itself is what counts).
        const { error: resolveErr } = await supabase
          .from('helper_sos_events')
          .update({ status: 'resolved', resolved_at: new Date().toISOString() })
          .eq('booking_id', bookingId)
          .eq('helper_id', callerId)
          .eq('status', 'active');
        if (resolveErr) { console.error('[household-arrival] sos resolve failed', resolveErr); return bad(500, 'Could not update — the team will still check on you'); }
        if (!demo) void fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'helper_sos',
            resolved: true,
            booking_id: bookingId,
            category: booking.category ?? 'job',
            helper_name: helperName,
            helper_phone: helperPhone,
          }),
        }).catch(() => {});
        return json(200, { ok: true, resolved: true });
      }

      // Record the event FIRST, fail-soft — a dead insert must never stop
      // the page going out. Coords are optional (GPS denied/failed): the
      // alert still carries the job address either way.
      const sosLat = Number.isFinite(Number(body?.lat)) ? Number(body.lat) : null;
      const sosLng = Number.isFinite(Number(body?.lng)) ? Number(body.lng) : null;
      const sosAccuracy = Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null;
      try {
        const { error: sosInsErr } = await supabase.from('helper_sos_events').insert({
          booking_id: bookingId,
          helper_id: callerId,
          lat: sosLat,
          lng: sosLng,
          accuracy_m: sosAccuracy,
        });
        if (sosInsErr) console.error('[household-arrival] sos insert failed', sosInsErr);
      } catch (e) { console.error('[household-arrival] sos insert threw', e); }

      // Best coords for the owner: the fresh fix from the tap, else the last
      // position streamed while on the way.
      const bestLat = sosLat ?? booking.worker_lat;
      const bestLng = sosLng ?? booking.worker_lng;
      const mapsUrl = (bestLat != null && bestLng != null) ? `https://www.google.com/maps?q=${bestLat},${bestLng}` : null;

      // Page the owner on every channel and AWAIT the answer — the helper's
      // screen tells them honestly whether a human was reached, and falls
      // back to direct WhatsApp + 999 when not.
      let alerted = demo; // demo: nobody is paged, the screen still shows "alerted"
      try {
        if (demo) throw new Error('demo — no page');
        const resp = await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'helper_sos',
            booking_id: bookingId,
            category: booking.category ?? 'job',
            job_status: booking.status,
            helper_name: helperName,
            helper_phone: helperPhone,
            customer_name: booking.customer_name ?? '',
            customer_phone: booking.customer_phone ?? '',
            customer_address: booking.customer_address ?? '',
            maps_url: mapsUrl,
          }),
        });
        const sent = await resp.json().catch(() => null) as { sent?: boolean } | null;
        alerted = resp.ok && sent?.sent !== false;
      } catch (e) { console.error('[household-arrival] sos admin page failed', e); }

      return json(200, { ok: true, alerted });
    }

    if (action === 'request_extra_time' || action === 'cancel_extra_time') {
      // ── "This job is bigger than it was booked for" ──────────────────────
      // The helper ASKS; the customer approves on /track (respond-extra-time).
      // Nothing about the money moves here — the extra is paid directly to the
      // helper at the end, with no Vano fee, so Stripe is not involved at all.
      // price_estimate_cents is deliberately untouched: it is what was quoted
      // and, under card-pay, what was charged.
      const bd = (booking.booking_data ?? {}) as Record<string, unknown> & ExtraTimeState;

      if (action === 'cancel_extra_time') {
        // Withdraw a request the customer hasn't answered yet ("actually,
        // I'll finish in time"). Idempotent — no pending request is a no-op,
        // not an error; the helper's screen may just be stale.
        const live = pendingExtraTime(bd);
        if (!live) return json(200, { ok: true, extra_time: null });
        const { error: cancelErr } = await supabase
          .from('household_bookings')
          .update({ booking_data: { ...bd, extra_time: null } })
          .eq('id', bookingId)
          .eq('student_id', callerId);
        if (cancelErr) { console.error('[household-arrival] extra-time cancel failed', cancelErr); return bad(500, 'Could not withdraw the request'); }
        return json(200, { ok: true, extra_time: null });
      }

      // Only while the work is actually happening. Before the job starts the
      // honest fix is to change the booking; after it's done, extra time isn't
      // a thing that can still be worked.
      if (!['arrived', 'in_progress'].includes(booking.status)) {
        return bad(409, 'Extra time can only be asked for while the job is underway.');
      }
      const minutes = Number(body?.minutes);
      const check = canRequestExtraTime(booking.category ?? '', bd, minutes);
      if (check.ok === false) return bad(409, check.reason);

      const request = {
        minutes,
        cents: check.cents,
        requested_at: new Date().toISOString(),
        status: 'pending' as const,
      };
      const { error: reqErr } = await supabase
        .from('household_bookings')
        .update({ booking_data: { ...bd, extra_time: request } })
        .eq('id', bookingId)
        .eq('student_id', callerId)
        .in('status', ['arrived', 'in_progress']);
      if (reqErr) { console.error('[household-arrival] extra-time request failed', reqErr); return bad(500, 'Could not send the request'); }

      await supabase.from('household_job_updates').insert({
        booking_id: bookingId,
        status: booking.status,
        note: `Helper asked for ${extraTimeText(minutes)} extra — waiting on the customer.`,
      });

      // Reach the customer in their pocket AND on the page. This is a moment
      // they have to act on: the helper is standing in their kitchen waiting.
      const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
      let helperFirst = 'Your helper';
      const { data: reqHelper } = await supabase
        .from('household_helpers').select('name').eq('user_id', callerId).maybeSingle() as { data: { name?: string | null } | null };
      if (reqHelper?.name) helperFirst = String(reqHelper.name).split(' ')[0];
      if (!demo) void sendHouseholdPush(bookingId, 'extra_time');
      if (!demo) void sendPocketMessage(
        booking.customer_phone,
        `⏱ ${helperFirst} says your job needs ${extraTimeText(minutes)} more (€${(check.cents / 100).toFixed(2)}, paid straight to them — no Vano fee). ` +
        `Approve or decline here: ${siteUrl}/track/${bookingId}`,
      );

      return json(200, { ok: true, extra_time: request });
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
      // Store the code in the service-role-only secrets table FIRST (so it's
      // there for the customer's /track display the instant the status flips),
      // then flip the booking. The base column stays null.
      const { error: secretErr } = await supabase
        .from('household_booking_secrets')
        .upsert({ booking_id: bookingId, arrival_code: newCode, updated_at: new Date().toISOString() }, { onConflict: 'booking_id' });
      if (secretErr) { console.error('[household-arrival] arrival code write failed', secretErr); return bad(500, 'Could not mark arrival'); }
      const { error: updErr } = await supabase
        .from('household_bookings')
        .update({ arrival_verified_at: null, status: 'arrived', arrival_attempts: 0, arrived_at: new Date().toISOString() })
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
        if (!demo) void sendHouseholdPush(bookingId, 'arrived');
        const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
        if (!demo) void sendPocketMessage(
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

    if (action === 'confirm_paid' || action === 'report_unpaid') {
      // ── Direct-pay two-way review ─────────────────────────────────────────
      // The customer pays the helper directly, so the helper closes the loop:
      // "I was paid" (optional star rating for the customer) or "they didn't
      // pay me" — a STRIKE. Strikes alert the owner immediately and, at
      // UNPAID_STRIKE_BLOCK_THRESHOLD (see _shared/vanoFees.ts), checkout
      // blocks the customer's phone until the owner clears it.
      // Upsert on booking_id so "not yet → paid" corrections just overwrite.
      if (!['in_progress', 'completed'].includes(booking.status)) {
        return bad(409, `Payment can be confirmed once the job is underway (status: ${booking.status})`);
      }
      const paid = action === 'confirm_paid';
      const stars = Number.isInteger(body?.rating) && body.rating >= 1 && body.rating <= 5 ? body.rating as number : null;
      const comment = typeof body?.comment === 'string' && body.comment.trim() ? body.comment.trim().slice(0, 400) : null;

      // The ratings row keys on the HELPER ROW id (public profile id), falling
      // back to the auth uid if the row lookup fails.
      let helperRowId = callerId;
      let helperFirst = 'A helper';
      const { data: helperRow } = await supabase
        .from('household_helpers').select('id, name').eq('user_id', callerId).maybeSingle() as { data: { id?: string; name?: string } | null };
      if (helperRow?.id) helperRowId = helperRow.id;
      if (helperRow?.name) helperFirst = helperRow.name.split(' ')[0];

      const { error: rateErr } = await supabase
        .from('household_customer_ratings')
        .upsert({
          booking_id: bookingId,
          helper_id: helperRowId,
          customer_phone: (booking.customer_phone ?? '').trim(),
          paid,
          rating: stars,
          comment,
        }, { onConflict: 'booking_id' });
      if (rateErr) {
        console.error('[household-arrival] customer rating upsert failed', rateErr);
        return bad(500, 'Could not save — try again');
      }

      // Reflect on the booking so the customer's tracking page can switch the
      // "Pay {name}" card to a paid tick (atomic top-level merge).
      try {
        await supabase.rpc('merge_booking_data', { p_id: bookingId, p_patch: { paid_to_helper: paid } });
      } catch { /* display-only — never blocks */ }

      if (!paid) {
        // A strike — page the owner NOW (WhatsApp best-effort, email always).
        const catLabel = booking.category ?? 'job';
        const jobEuros = ((booking.price_estimate_cents ?? 0) / 100).toFixed(2);
        const alertText = [
          `🚨 UNPAID JOB reported by ${helperFirst}`,
          `Booking: ${bookingId.slice(-8).toUpperCase()} (${catLabel})`,
          `Customer: ${booking.customer_name ?? '—'} · ${booking.customer_phone ?? '—'}`,
          `Owed to helper: €${jobEuros}`,
          comment ? `Note: ${comment}` : null,
          `A second strike blocks this number from booking.`,
        ].filter(Boolean).join('\n');
        const adminPhone = Deno.env.get('ADMIN_WHATSAPP_TO')?.trim() || Deno.env.get('ADMIN_PHONE')?.trim() || null;
        if (adminPhone && !demo) void sendPocketMessage(adminPhone, alertText);
        try {
          const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
          const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
          if (resendKey && adminEmail && !demo) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>',
                to: [adminEmail],
                subject: `🚨 Helper reports UNPAID job — ${booking.customer_phone ?? 'unknown phone'}`,
                text: alertText,
              }),
            });
          }
        } catch (e) { console.warn('[household-arrival] unpaid-alert email failed', e); }
      }

      return json(200, { ok: true, paid });
    }

    if (action === 'start_gps') {
      // GPS-verified arrival — the invisible-friction path. The helper's phone
      // says they're at the door; the server checks that claim against the
      // customer's coords AND corroborates with the position streamed during
      // on_way. Match → the job starts with no code ritual. The 4-digit code
      // stays as the fallback (GPS denied, no fix, coords missing, too far).
      // Direct-pay made this safe to offer as the default: completion moves no
      // money any more, so the code was guarding ceremony, not cash.
      if (booking.arrival_verified_at) return json(200, { ok: true, started: true, status: 'in_progress', job_ends_at: null });
      if (!['on_way', 'arrived'].includes(booking.status)) {
        return bad(409, `Can only GPS-start once on the way (status: ${booking.status})`);
      }
      const lat = Number(body?.lat), lng = Number(body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bad(400, 'lat/lng required');
      if (booking.customer_lat == null || booking.customer_lng == null) {
        return json(200, { ok: true, started: false, no_customer_coords: true });
      }
      // 150m: generous urban-GPS buffer, still unmistakably "at the address".
      const distM = haversineMeters(lat, lng, booking.customer_lat, booking.customer_lng);
      if (distM > 150) return json(200, { ok: true, started: false, too_far: true, distance_m: Math.round(distM) });
      // The same phone should not claim the door while its live stream says
      // elsewhere (stream updates every ~15s on the way).
      if (booking.worker_lat != null && booking.worker_lng != null) {
        const streamedM = haversineMeters(booking.worker_lat, booking.worker_lng, booking.customer_lat, booking.customer_lng);
        if (streamedM > 500) return json(200, { ok: true, started: false, too_far: true, distance_m: Math.round(streamedM) });
      }

      const nowMs = Date.now();
      const mins = isTimedCategory(booking.category) ? bookedDurationMinutes(booking.category, booking.booking_data) : null;
      const jobEndsAt = mins ? new Date(nowMs + mins * 60_000).toISOString() : null;

      const { error: gpsErr } = await supabase
        .from('household_bookings')
        .update({ arrival_verified_at: new Date(nowMs).toISOString(), arrived_at: new Date(nowMs).toISOString(), status: 'in_progress', job_ends_at: jobEndsAt, arrival_attempts: 0 })
        .eq('id', bookingId)
        .eq('student_id', callerId)
        .in('status', ['on_way', 'arrived']);
      if (gpsErr) { console.error('[household-arrival] start_gps update failed', gpsErr); return bad(500, 'Could not start job'); }

      await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'in_progress', note: 'Arrival confirmed by GPS — job started, no code needed.' });
      try { await supabase.rpc('merge_booking_data', { p_id: bookingId, p_patch: { arrival_method: 'gps' } }); } catch { /* display-only — never blocks */ }

      // Tell the customer their helper is there and the job's underway — with
      // the tracking link so a surprised customer can see (or report) it.
      if (!demo) void sendHouseholdPush(bookingId, 'arrived');
      const gpsSiteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
      if (!demo) void sendPocketMessage(
        booking.customer_phone,
        `👋 Your VANO helper has arrived — their location matched your address, so the job has started. Follow along or flag anything here: ${gpsSiteUrl}/track/${bookingId}`,
      );

      return json(200, { ok: true, started: true, status: 'in_progress', job_ends_at: jobEndsAt });
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
      if (!demo) void sendHouseholdPush(bookingId, 'arrived');

      // Admin: flag the unverified start so the owner can keep an eye on it.
      // Best-effort — never block the helper's flow on the alert.
      const catLabel = booking.category ?? 'job';
      const ref = bookingId.slice(-8).toUpperCase();
      if (!demo) void fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
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
    if (booking.status !== 'arrived' || !arrivalCode) return bad(409, 'No arrival code to verify yet');

    // Anti-brute-force: the 4-digit code is the proof-of-presence, so cap wrong
    // guesses. After 5 misses we lock verification; the helper taps "I've
    // reached" again to issue a fresh code (which resets this counter).
    const attempts = booking.arrival_attempts ?? 0;
    if (attempts >= 5) return json(200, { ok: true, verified: false, locked: true });
    if (!/^\d{4}$/.test(code) || code !== arrivalCode) {
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
