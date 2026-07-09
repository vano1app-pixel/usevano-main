import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Attaches a partner/referral code to a freshly-created helper application.
// Called by the Join flow right after create-helper-application returns a
// helper_id. Setting household_helpers.referred_by_code fires a DB trigger that
// resolves the code to an attribution (so the partner earns commission on this
// helper's completed jobs). Unknown/blank codes are a no-op. Idempotent: only
// stamps a helper that doesn't already have a code, so a re-submit can't move
// an attribution. Codes aren't secrets, so a guest (anon) entry point is fine.

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

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = await req.json().catch(() => ({}));
    const helperId = typeof body.helper_id === 'string' ? body.helper_id.trim() : '';
    const code = (typeof body.code === 'string' ? body.code : '').trim().toUpperCase();
    if (!helperId || !code) return ok({ applied: false }); // nothing to do — never an error to the user
    // Strict shape gate: codes are alphanumeric only. Without this, ilike
    // treats % / _ as wildcards, so a "code" of % would match the first
    // active row and hand a random partner the attribution.
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return ok({ applied: false });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Only a real, active code counts — and don't overwrite an existing one.
    const { data: codeRow } = await supabase
      .from('referral_codes').select('id').ilike('code', code).eq('active', true).maybeSingle();
    if (!codeRow) return ok({ applied: false });

    const { data: helper } = await supabase
      .from('household_helpers').select('referred_by_code').eq('id', helperId).maybeSingle();
    if (!helper) return ok({ applied: false });
    if ((helper.referred_by_code as string | null)?.trim()) return ok({ applied: true, already: true });

    const { error } = await supabase
      .from('household_helpers').update({ referred_by_code: code }).eq('id', helperId);
    if (error) { console.warn('[attach-referral-code] update failed', error); return ok({ applied: false }); }

    return ok({ applied: true });
  } catch (err) {
    console.error('[attach-referral-code] unhandled', err);
    return ok({ applied: false }); // never block signup on a referral hiccup
  }
});
