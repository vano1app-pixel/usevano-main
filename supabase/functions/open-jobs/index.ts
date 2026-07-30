import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hasAccountAccess } from "../_shared/accountToken.ts";
import { signAcceptToken } from "../_shared/acceptToken.ts";
// Neighbourhood label — the board shows WHERE ROUGHLY, never the address
// (owner call 2026-07-30: "not the exact house").
import { approxAreaLabel } from "../_shared/serviceAreas.ts";

// ── The open-jobs board (2026-07-30) ──────────────────────────────────────
// Dispatch pings every eligible helper ONCE per round (SMS/WhatsApp/push) —
// a helper who misses the ping never sees the job again unless they have an
// auth session for the dashboard's "available" tab, which most phone-gated
// helpers don't. This endpoint is the missed-the-ping recovery: the list of
// jobs open RIGHT NOW, rendered on /student-account behind the phone gate.
//
// Two trust tiers in one response:
//   • The LIST is sanitised and safe for anyone: category, size, city, when,
//     what it pays. NEVER the address, customer name/phone, or the note
//     (notes carry gate codes and door details). Same information a passer-by
//     could infer from the dispatch SMS a helper showed them.
//   • The CLAIM links are per-helper and gated: only a live account session
//     (hasAccountAccess — the texted-code token or the month device token)
//     for an APPROVED + ID-VERIFIED helper gets accept_url on each job.
//     The link is the SAME signed accept-job token dispatch mints, so the
//     claim rides the whole hardened path untouched: bot gate, re-checks at
//     claim time, atomic race guard, silent sign-in, notify + the
//     back-to-back nudge. This function invents NO claim logic.
//
// Sessionless callers (or unverified helpers) still get the list — seeing
// "€36 cleaning open in Galway right now" is the best verify-your-ID nudge
// there is; the UI pairs it with the verify CTA instead of a claim button.

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

interface OpenJob {
  id: string;
  category: string | null;
  /** Neighbourhood-grained ("Salthill"), never street-level. The exact
   *  address unlocks only after this helper claims the job. */
  area: string | null;
  size_label: string | null;
  /** Short job label from the sheet (builder "+2" labels, custom job names,
   *  dog answers) — task words, never customer words. */
  extra_label: string | null;
  /** What the helper keeps — 100% of this under direct-pay. */
  earn_cents: number | null;
  created_at: string;
  scheduled_at: string | null;
  /** Customer trust snapshot stamped at checkout — same chip dispatch offers
   *  show ("Pays promptly · 3 jobs · ★4.8"). Counts only, no identity. */
  customer_rep: { paid_jobs?: number; unpaid_reports?: number; stars?: number } | null;
  /** Only present for an eligible session — the signed one-tap claim link. */
  accept_url?: string;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({})) as { helper_id?: string; account_token?: string };

    // ── The open board ──────────────────────────────────────────────────
    // pending + unassigned, born in the last 48 h (older pending is the
    // sweeps' business), and not scheduled further out than 12 h — a job for
    // Saturday shouldn't tempt a claim on Tuesday when dispatch-scheduled-
    // jobs will fan it out properly inside its lead window.
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const horizon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    const { data: rows, error: qErr } = await supabase
      .from('household_bookings')
      .select('id, category, city, customer_lat, customer_lng, customer_address, price_estimate_cents, created_at, scheduled_at, booking_data, student_id, status')
      .eq('status', 'pending')
      .is('student_id', null)
      .gte('created_at', cutoff)
      .or(`scheduled_at.is.null,scheduled_at.lte.${horizon}`)
      .order('created_at', { ascending: false })
      .limit(20);
    if (qErr) { console.error('[open-jobs] query failed', qErr); return bad(500, 'Could not load open jobs'); }

    const jobs: OpenJob[] = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const bd = (r.booking_data ?? {}) as Record<string, unknown>;
      const rep = (bd.customer_rep ?? null) as OpenJob['customer_rep'];
      return {
        id: r.id as string,
        category: (r.category as string | null) ?? null,
        // NEVER r.customer_address — approxAreaLabel can only ever return a
        // name from the fixed area table, the city, or a safe generic.
        area: approxAreaLabel({
          lat: (r.customer_lat as number | null) ?? null,
          lng: (r.customer_lng as number | null) ?? null,
          address: (r.customer_address as string | null) ?? null,
          city: (r.city as string | null) ?? null,
        }),
        size_label: typeof bd.size_label === 'string' ? bd.size_label : null,
        extra_label: typeof bd.extra_label === 'string' ? (bd.extra_label as string).slice(0, 80) : null,
        earn_cents: (r.price_estimate_cents as number | null) ?? null,
        created_at: r.created_at as string,
        scheduled_at: (r.scheduled_at as string | null) ?? null,
        customer_rep: rep && typeof rep === 'object' ? rep : null,
      };
    });

    // ── Claim links, only for a proven, job-eligible helper ─────────────
    let eligible = false;
    let ineligibleReason: 'no_session' | 'not_verified' | 'not_approved' | null = jobs.length ? 'no_session' : null;
    const helperId = typeof body.helper_id === 'string' ? body.helper_id.trim() : '';
    if (helperId && (await hasAccountAccess(body.account_token, helperId))) {
      const { data: helper } = await supabase
        .from('household_helpers')
        .select('id, user_id, status, id_verified')
        .eq('id', helperId)
        .maybeSingle() as { data: { id: string; user_id: string | null; status: string; id_verified: boolean | null } | null };
      if (!helper || helper.status !== 'approved') {
        ineligibleReason = 'not_approved';
      } else if (!helper.id_verified) {
        // Same first-job gate as dispatch + accept-job: no ID, no claim.
        ineligibleReason = 'not_verified';
      } else {
        eligible = true;
        ineligibleReason = null;
        // Same token accept-job verifies — 2 h expiry, plenty for a board tap.
        const expEpoch = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
        await Promise.all(jobs.map(async (j) => {
          try {
            const tok = await signAcceptToken({ b: j.id, h: helper.id, u: helper.user_id ?? null, e: expEpoch });
            j.accept_url = `${supabaseUrl}/functions/v1/accept-job?t=${tok}`;
          } catch { /* job stays listed without a link — fail-soft */ }
        }));
      }
    }

    return new Response(
      JSON.stringify({ jobs, eligible, ...(ineligibleReason ? { reason: ineligibleReason } : {}), generated_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[open-jobs] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
