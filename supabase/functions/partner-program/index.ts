import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Partner / referral program: returns (creating on first call) the shareable
// code for a recruiter — a student union, society, or an existing helper — that
// brings students onto VANO, plus their live earnings. When a recruited helper
// completes a paid job, a DB trigger accrues commission (default 3% of the job,
// out of VANO's cut). Codes aren't secrets, so a guest entry point is fine.

const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173', 'http://localhost:8080',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
// The native apps load the SAME bundle from a local origin — iOS serves it
// from capacitor://localhost, Android from https://localhost (see
// capacitor.config.ts). These must ALWAYS pass the origin gate, even when the
// ALLOWED_ORIGINS secret overrides the fallback list, or every origin-gated
// call 403s inside the installed app.
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  const base = !raw
    ? FALLBACK_ORIGINS
    : raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return [...base, ...NATIVE_APP_ORIGINS];
}
function allowsVercelPreview(origin: string): boolean {
  try { return new URL(origin).hostname.endsWith('-vano1app-pixels-projects.vercel.app'); } catch { return false; }
}
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  if (getAllowlist().includes(n)) return n;
  if (allowsVercelPreview(n)) return n;
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
function isOriginAllowed(req: Request): boolean {
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}

// Unambiguous alphabet (no 0/O, 1/I/L) so codes survive being read aloud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = await req.json().catch(() => ({}));
    const email = (typeof body.email === 'string' ? body.email : '').trim().toLowerCase();
    const name  = (typeof body.name  === 'string' ? body.name  : '').trim() || null;
    const phone = (typeof body.phone === 'string' ? body.phone : '').trim() || null;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return bad(400, 'A valid email is required');
    }
    // ilike treats % and _ as wildcards — unescaped, an "email" like %@%.com
    // would match the FIRST row in the table and hand back someone else's
    // code + commission stats. Escape them; ilike is only used for
    // case-insensitivity on legacy mixed-case rows.
    const emailPattern = email.replace(/([\\%_])/g, '\\$1');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Existing code for this email, or mint one (retry on the rare collision).
    let codeRow: { id: string; code: string; commission_bps: number } | null = null;
    const { data: existing } = await supabase
      .from('referral_codes')
      .select('id, code, commission_bps')
      .ilike('owner_email', emailPattern)
      .maybeSingle();

    if (existing) {
      codeRow = existing as typeof codeRow;
    } else {
      for (let attempt = 0; attempt < 4 && !codeRow; attempt++) {
        const candidate = generateCode();
        const { data: inserted, error: insertErr } = await supabase
          .from('referral_codes')
          .insert({ code: candidate, owner_email: email, owner_name: name, owner_phone: phone, kind: 'partner' })
          .select('id, code, commission_bps')
          .maybeSingle();
        if (!insertErr && inserted) { codeRow = inserted as typeof codeRow; break; }
        // Concurrent create for the same email → read theirs.
        const { data: raced } = await supabase
          .from('referral_codes')
          .select('id, code, commission_bps')
          .ilike('owner_email', emailPattern)
          .maybeSingle();
        if (raced) { codeRow = raced as typeof codeRow; break; }
      }
    }
    if (!codeRow) return bad(500, 'Could not create a code. Please try again.');

    // Signups attributed to this code.
    const { count: signups } = await supabase
      .from('referral_attributions')
      .select('id', { count: 'exact', head: true })
      .eq('code_id', codeRow.id);

    // Distinct devices that OPENED this code's link — the top of the funnel
    // (track-referral-open dedups per device, so this is "people", not loads).
    const { count: linkOpens } = await supabase
      .from('referral_code_visits')
      .select('id', { count: 'exact', head: true })
      .eq('code_id', codeRow.id);

    // Earnings split by status, plus the live-tracker extras: this-month
    // total, distinct earning helpers, and a recent-activity feed. The feed
    // is what makes the card read as passive income actually landing.
    const { data: commissions } = await supabase
      .from('referral_commissions')
      .select('amount_cents, status, created_at, helper_id, booking_id')
      .eq('code_id', codeRow.id)
      .order('created_at', { ascending: false })
      .limit(500);

    let pendingCents = 0, paidCents = 0, jobs = 0, thisMonthCents = 0;
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const activeHelpers = new Set<string>();
    for (const c of commissions ?? []) {
      const amt = (c.amount_cents as number) ?? 0;
      jobs++;
      if (c.status === 'paid') paidCents += amt; else pendingCents += amt;
      if (c.created_at && new Date(c.created_at as string) >= monthStart) thisMonthCents += amt;
      if (c.helper_id) activeHelpers.add(c.helper_id as string);
    }

    // Enrich the latest rows with the helper's FIRST name + job category only
    // (this endpoint is keyed by a non-secret email — never expose more).
    const recentRaw = (commissions ?? []).slice(0, 8);
    const helperIds  = [...new Set(recentRaw.map((c) => c.helper_id).filter(Boolean))] as string[];
    const bookingIds = [...new Set(recentRaw.map((c) => c.booking_id).filter(Boolean))] as string[];
    const [helpersRes, bookingsRes] = await Promise.all([
      helperIds.length
        ? supabase.from('household_helpers').select('id, name').in('id', helperIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null }[] }),
      bookingIds.length
        ? supabase.from('household_bookings').select('id, category').in('id', bookingIds)
        : Promise.resolve({ data: [] as { id: string; category: string | null }[] }),
    ]);
    const nameOf = new Map(
      ((helpersRes.data ?? []) as { id: string; name: string | null }[])
        .map((h) => [h.id, (h.name ?? '').trim().split(/\s+/)[0] || null]),
    );
    const catOf = new Map(
      ((bookingsRes.data ?? []) as { id: string; category: string | null }[])
        .map((b) => [b.id, b.category ?? null]),
    );
    const recent = recentRaw.map((c) => ({
      amount_cents: (c.amount_cents as number) ?? 0,
      status: c.status as string,
      created_at: c.created_at as string,
      helper_name: c.helper_id ? (nameOf.get(c.helper_id as string) ?? null) : null,
      category: c.booking_id ? (catOf.get(c.booking_id as string) ?? null) : null,
    }));

    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

    return new Response(
      JSON.stringify({
        code: codeRow.code,
        link: `${siteUrl}/join?ref=${codeRow.code}`,
        commission_pct: (codeRow.commission_bps ?? 300) / 100,
        signups: signups ?? 0,
        link_opens: linkOpens ?? 0,
        jobs,
        pending_cents: pendingCents,
        paid_cents: paidCents,
        total_cents: pendingCents + paidCents,
        this_month_cents: thisMonthCents,
        active_helpers: activeHelpers.size,
        recent,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[partner-program] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
