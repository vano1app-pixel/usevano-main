import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";

// Returns a helper's own profile for the phone-gated edit pages
// (/helper/profile and /student-account). Runs with the service role so
// the anon role no longer needs SELECT access to helpers' phone/email
// columns — those are revoked at the DB level.

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

// NB: email is deliberately NOT returned — this endpoint is an unauthenticated
// phone lookup, and a helper's email is the sensitive bit (phishing / account
// takeover). The self-service profile editor doesn't use it.
const PROFILE_COLUMNS =
  'id, name, phone, photo_url, city, bio, categories, availability, status, stripe_account_id, stripe_payouts_enabled';

serve(async (req) => {
  const cors = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : '';
    if (!rawPhone) return bad(400, 'phone required');

    // Normalise: strip spaces, dashes, dots; keep leading +
    const phone = rawPhone.replace(/[\s\-().]/g, '');
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return bad(400, 'Invalid phone number');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: unauthenticated PII lookup by phone — throttle to stop
    // harvesting helper profiles by iterating the mobile number space.
    if (!await allowRequest(supabase, 'find-helper-by-phone', clientIp(req), 10, 600)) {
      return bad(429, 'Too many lookups — please wait a minute and try again.');
    }

    // Exact match across country-code variations
    // e.g. "0831234567" and "+353831234567" and "353831234567"
    const variants = new Set<string>([phone]);
    if (phone.startsWith('+353')) {
      variants.add('0' + phone.slice(4));
      variants.add(phone.slice(1));
    } else if (phone.startsWith('353')) {
      variants.add('+' + phone);
      variants.add('0' + phone.slice(3));
    } else if (phone.startsWith('0')) {
      variants.add('+353' + phone.slice(1));
      variants.add('353' + phone.slice(1));
    }

    let { data, error: dbErr } = await supabase
      .from('household_helpers')
      .select(PROFILE_COLUMNS)
      .in('phone', [...variants])
      .neq('status', 'suspended')
      .limit(1)
      .maybeSingle();

    // Fallback: stored numbers sometimes contain spaces or odd formatting —
    // compare digits only, matching on the last 9 (Irish mobile without prefix).
    if (!data && !dbErr) {
      const last9 = digits.slice(-9);
      const { data: rows, error: listErr } = await supabase
        .from('household_helpers')
        .select('id, phone')
        .neq('status', 'suspended');
      if (listErr) {
        dbErr = listErr;
      } else {
        const hit = (rows ?? []).find((r: { id: string; phone: string | null }) =>
          (r.phone ?? '').replace(/\D/g, '').endsWith(last9));
        if (hit) {
          const { data: full, error: fullErr } = await supabase
            .from('household_helpers')
            .select(PROFILE_COLUMNS)
            .eq('id', hit.id)
            .maybeSingle();
          data = full;
          dbErr = fullErr;
        }
      }
    }

    if (dbErr) {
      console.error('[find-helper-by-phone]', dbErr);
      return bad(500, 'Database error');
    }
    if (!data) {
      return new Response(JSON.stringify({ helper: null }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ helper: data }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[find-helper-by-phone] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
