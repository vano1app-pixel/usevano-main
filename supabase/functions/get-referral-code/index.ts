import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Inlined CORS ──────────────────────────────────────────────────────────────
const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173',
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
// ─────────────────────────────────────────────────────────────────────────────

// Give €5, get €5: returns (creating on first call) the shareable referral
// code for a phone number, plus the caller's current credit state. Codes are
// not secrets — knowing someone's code only lets you give THEM credit — so a
// guest (anon) entry point is fine. Phones never leave this function.

function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
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
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalizeE164(typeof body.phone === 'string' ? body.phone : null);
    if (!phone) return bad(400, 'A valid phone number is required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Existing code for this phone, or mint one (retry on the rare collision).
    let code: string | null = null;
    const { data: existing } = await supabase
      .from('household_referral_codes')
      .select('code')
      .eq('phone', phone)
      .maybeSingle();

    if (existing?.code) {
      code = existing.code as string;
    } else {
      for (let attempt = 0; attempt < 4 && !code; attempt++) {
        const candidate = generateCode();
        const { error: insertErr } = await supabase
          .from('household_referral_codes')
          .insert({ phone, code: candidate });
        if (!insertErr) { code = candidate; break; }
        // 23505 unique_violation on `code` → collide, regenerate. On `phone`
        // → a concurrent request won the race; read theirs.
        const { data: raced } = await supabase
          .from('household_referral_codes')
          .select('code')
          .eq('phone', phone)
          .maybeSingle();
        if (raced?.code) { code = raced.code as string; break; }
      }
    }
    if (!code) return bad(500, 'Could not create a referral code. Please try again.');

    // Credit state: earned = spendable now, redeemed/pending for the counter.
    const { data: rows } = await supabase
      .from('household_referrals')
      .select('status, credit_cents')
      .eq('referrer_phone', phone);

    let creditCents = 0;
    let friendsJoined = 0;
    for (const r of rows ?? []) {
      const status = r.status as string;
      if (status === 'earned') creditCents += (r.credit_cents as number) ?? 500;
      if (status === 'earned' || status === 'redeemed') friendsJoined++;
    }

    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

    return new Response(
      JSON.stringify({
        code,
        link: `${siteUrl}/?ref=${code}`,
        credit_cents: creditCents,
        friends_joined: friendsJoined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[get-referral-code] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
