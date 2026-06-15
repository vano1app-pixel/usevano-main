import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTimedCategory, bookedDurationMinutes } from "../_shared/householdJob.ts";

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
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type';

function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  const list = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const allowed = list.length ? list : FALLBACK_ORIGINS;
  if (allowed.includes(n)) return n;
  try { if (new URL(n).hostname.endsWith('-vano1app-pixels-projects.vercel.app')) return n; } catch { /* not a URL */ }
  return null;
}
function buildCorsHeaders(req: Request) {
  return { 'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null', 'Access-Control-Allow-Headers': ALLOWED_HEADERS, 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' };
}
function isOriginAllowed(req: Request) { return !req.headers.get('Origin') || matchOrigin(req) !== null; }

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
    const action = body?.action === 'verify' || body?.action === 'finished' ? body.action : 'request';
    const code = typeof body?.code === 'string' ? body.code.trim() : '';
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, student_id, status, arrival_code, arrival_verified_at, category, booking_data')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; student_id: string | null; status: string; arrival_code: string | null; arrival_verified_at: string | null; category: string; booking_data: Record<string, unknown> | null } | null; error: unknown };

    if (fetchErr || !booking) return bad(404, 'Booking not found');
    if (booking.student_id !== callerId) return bad(403, 'Not the assigned helper');

    if (action === 'request') {
      // Helper just tapped "I've reached". Generate the code and move the job
      // to 'arrived' so the customer's screen reveals it. Idempotent: if the
      // job is already at 'arrived' awaiting the code, keep the existing one.
      if (!['accepted', 'on_way', 'arrived'].includes(booking.status)) {
        return bad(409, `Cannot mark arrival in status: ${booking.status}`);
      }
      if (booking.status === 'arrived' && booking.arrival_code) {
        return json(200, { ok: true, status: 'arrived' });
      }

      const newCode = String(Math.floor(1000 + Math.random() * 9000));
      const { error: updErr } = await supabase
        .from('household_bookings')
        .update({ arrival_code: newCode, arrival_verified_at: null, status: 'arrived' })
        .eq('id', bookingId)
        .eq('student_id', callerId)
        .in('status', ['accepted', 'on_way', 'arrived']);
      if (updErr) { console.error('[household-arrival] request update failed', updErr); return bad(500, 'Could not mark arrival'); }

      await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'arrived', note: 'Helper reached the address — awaiting arrival code.' });
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

    // action === 'verify'
    if (booking.arrival_verified_at) return json(200, { ok: true, verified: true, status: 'in_progress' });
    if (booking.status !== 'arrived' || !booking.arrival_code) return bad(409, 'No arrival code to verify yet');

    if (!/^\d{4}$/.test(code) || code !== booking.arrival_code) {
      return json(200, { ok: true, verified: false });
    }

    // Timed jobs get a job_ends_at so the screens can show a countdown. The job
    // is NEVER auto-completed — the customer must mark it complete to pay the
    // helper. The timer is just a guide for both sides.
    const nowMs = Date.now();
    const mins = isTimedCategory(booking.category) ? bookedDurationMinutes(booking.category, booking.booking_data) : null;
    const jobEndsAt = mins ? new Date(nowMs + mins * 60_000).toISOString() : null;

    const { error: verifyErr } = await supabase
      .from('household_bookings')
      .update({ arrival_verified_at: new Date(nowMs).toISOString(), status: 'in_progress', job_ends_at: jobEndsAt })
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
