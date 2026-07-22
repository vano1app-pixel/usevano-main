import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";

// Records that someone OPENED a partner's /join?ref=CODE link — the top of the
// referral funnel the dashboard shows as "people opened your link". Called by
// the Join page when it loads with a ?ref code present.
//
// Dedup is by (code_id, visitor_key): the client sends a random per-device id
// (kept in localStorage), and a unique index means a refresh or repeat visit
// never re-counts, so the number reads as PEOPLE not page loads. Codes aren't
// secrets and this only ever bumps a counter, so a guest (anon) entry point is
// fine. Fail-soft in every branch — a tracking hiccup must never affect the
// page the visitor came to see.

const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173', 'http://localhost:8080',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
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
    const code = (typeof body.code === 'string' ? body.code : '').trim().toUpperCase();
    const visitorKey = (typeof body.visitor_key === 'string' ? body.visitor_key : '').trim();

    // Strict shapes. Codes are alphanumeric (same gate as attach-referral-code:
    // without it, ilike treats % / _ as wildcards). visitor_key is a random
    // client id — bound its charset + length so it can't smuggle anything.
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return ok({ tracked: false });
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(visitorKey)) return ok({ tracked: false });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Lid on the endpoint (it's unauthenticated + writes rows) — generous, since
    // real openers are one insert each and the unique index absorbs repeats.
    if (!await allowRequest(supabase, 'track-referral-open', clientIp(req), 60, 600)) {
      return ok({ tracked: false });
    }

    // Resolve to a real, active code — never create rows for a bogus code.
    const { data: codeRow } = await supabase
      .from('referral_codes').select('id').ilike('code', code).eq('active', true).maybeSingle();
    if (!codeRow) return ok({ tracked: false });

    // One row per device per code. on_conflict do-nothing → repeat opens are
    // silently ignored, so the count stays "distinct people".
    const { error } = await supabase
      .from('referral_code_visits')
      .upsert({ code_id: codeRow.id, visitor_key: visitorKey }, { onConflict: 'code_id,visitor_key', ignoreDuplicates: true });
    if (error) { console.warn('[track-referral-open] insert failed', error); return ok({ tracked: false }); }

    return ok({ tracked: true });
  } catch (err) {
    console.error('[track-referral-open] unhandled', err);
    return ok({ tracked: false }); // never surface a tracking error to the visitor
  }
});
