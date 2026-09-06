import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isReviewDemoBooking, isReviewDemoHelperPhone } from "../_shared/reviewDemo.ts";

// ── In-app claim (2026-09-06) ────────────────────────────────────────────────
// The Find screen's "Claim this job". Same atomic race guard as accept-job
// (update … where status='pending' and student_id is null) — first tap wins,
// no application, nobody in the middle — but keyed on the helper's Supabase
// session instead of a signed link, and it answers JSON instead of
// redirecting. The post-claim flow (fee capture, customer's "your helper is
// confirmed" text, the 'accepted' job update) is the SAME
// notify-household-accepted call accept-job makes; this function invents
// no money logic.
//
// Review demo: the demo helper may only claim demo orders and real helpers
// can never claim one; a demo claim skips the notify call entirely.

const FALLBACK_ORIGINS = ['https://vanojobs.com','https://www.vanojobs.com','http://localhost:5173','http://localhost:4173','http://localhost:8080'];
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
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

type ClaimStatus = 'claimed' | 'mine' | 'taken' | 'expired' | 'notfound' | 'not_eligible';

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const result = (status: ClaimStatus, extra: Record<string, unknown> = {}) => json(200, { status, ...extra });
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return json(403, { error: 'Forbidden origin' });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Sign in to claim a job' });
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return json(401, { error: 'Sign in to claim a job' });

    const body = await req.json().catch(() => ({})) as { booking_id?: string; lat?: number; lng?: number };
    const bookingId = typeof body.booking_id === 'string' ? body.booking_id.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(bookingId)) return json(400, { error: 'booking_id required' });

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, status, id_verified, phone')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { id: string; status: string; id_verified: boolean | null; phone: string | null } | null };
    if (!helper) return result('not_eligible', { reason: 'no_helper' });
    const demoHelper = isReviewDemoHelperPhone(helper.phone);
    // Same first-job gate as dispatch / accept-job / open-jobs: approved + ID.
    if (!demoHelper && helper.status !== 'approved') return result('not_eligible', { reason: 'not_approved' });
    if (!demoHelper && !helper.id_verified) return result('not_eligible', { reason: 'not_verified' });

    const { data: booking } = await supabase
      .from('household_bookings')
      .select('id, status, student_id, booking_data, created_at')
      .eq('id', bookingId)
      .maybeSingle() as { data: { id: string; status: string; student_id: string | null; booking_data: Record<string, unknown> | null; created_at: string } | null };
    if (!booking) return result('notfound');
    if (isReviewDemoBooking(booking.booking_data) !== demoHelper) return result('notfound');
    if (booking.status !== 'pending' || booking.student_id) {
      return result(booking.student_id === user.id ? 'mine' : 'taken');
    }
    // The open window the board shows (48 h) — older pending rows belong to the sweeps.
    if (Date.now() - new Date(booking.created_at).getTime() > 48 * 3600_000) return result('expired');

    const { data: claimed } = await supabase
      .from('household_bookings')
      .update({ status: 'accepted', student_id: user.id, accepted_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', 'pending')
      .is('student_id', null)
      .select('id')
      .maybeSingle();
    if (!claimed) {
      const { data: after } = await supabase.from('household_bookings').select('student_id').eq('id', bookingId).maybeSingle() as { data: { student_id: string | null } | null };
      return result(after?.student_id === user.id ? 'mine' : 'taken');
    }

    // Best-effort bookkeeping — never blocks the claim.
    await supabase.from('household_job_offers').update({ status: 'accepted' }).eq('booking_id', bookingId).eq('helper_id', helper.id);
    if (isReviewDemoBooking(booking.booking_data)) {
      // The screens need the 'accepted' timeline row; nothing else fires.
      await supabase.from('household_job_updates').insert({ booking_id: bookingId, status: 'accepted', note: 'Helper claimed the job.' });
      return result('claimed', { demo: true });
    }
    // Same post-accept flow as accept-job: writes the 'accepted' update,
    // captures the fee hold, texts the customer. Internal service-role path.
    fetch(`${supabaseUrl}/functions/v1/notify-household-accepted`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'x-internal-accept': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    }).catch(() => {});

    console.log(`[claim-order] booking ${bookingId} claimed by helper ${helper.id} (user ${user.id})`);
    return result('claimed');
  } catch (err) {
    console.error('[claim-order] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
