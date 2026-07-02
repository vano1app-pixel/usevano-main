import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";

// Friend-referral program: returns (creating on first call) the shareable
// invite code for a helper (or anyone) who brings friends onto VANO, plus
// their live earnings. When a referred friend completes a paid job within
// their first 12 months, a DB trigger accrues 5% of what the friend EARNED
// (their net payout) — funded from VANO's cut, never the friend's pay.
// Codes aren't secrets, so a guest entry point is fine.

const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173', 'http://localhost:8080',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return FALLBACK_ORIGINS;
  return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Same IP budget as get-referral-code: stops bots minting junk codes or
    // enumerating other people's earnings by email.
    if (!await allowRequest(supabase, 'partner-program', clientIp(req), 20, 600)) {
      return bad(429, 'Too many requests — please try again shortly.');
    }

    // Existing code for this email, or mint one (retry on the rare collision).
    let codeRow: { id: string; code: string; commission_bps: number } | null = null;
    const { data: existing } = await supabase
      .from('referral_codes')
      .select('id, code, commission_bps')
      .ilike('owner_email', email)
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
          .ilike('owner_email', email)
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

    // Earnings split by status.
    const { data: commissions } = await supabase
      .from('referral_commissions')
      .select('amount_cents, status')
      .eq('code_id', codeRow.id);

    let pendingCents = 0, paidCents = 0, jobs = 0;
    for (const c of commissions ?? []) {
      const amt = (c.amount_cents as number) ?? 0;
      jobs++;
      if (c.status === 'paid') paidCents += amt; else pendingCents += amt;
    }

    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

    return new Response(
      JSON.stringify({
        code: codeRow.code,
        link: `${siteUrl}/join?ref=${codeRow.code}`,
        commission_pct: (codeRow.commission_bps ?? 500) / 100,
        signups: signups ?? 0,
        jobs,
        pending_cents: pendingCents,
        paid_cents: paidCents,
        total_cents: pendingCents + paidCents,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[partner-program] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
