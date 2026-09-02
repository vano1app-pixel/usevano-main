import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";
import { hasAccountAccess } from "../_shared/accountToken.ts";

// Returns a helper's own profile for the phone-gated /student-account page.
// Runs with the service role so the anon role no longer needs SELECT access
// to helpers' phone/email columns — those are revoked at the DB level.
//
// AUTH (phone-gate hardening, July 2026): the caller must present the
// account_token minted by student-account-otp — knowing a helper's number no
// longer reads their profile. Missing/expired token → 401
// `verification_required`, which the page turns into its code step.

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
// ─────────────────────────────────────────────────────────────────────────────

// NB: email is deliberately NOT returned — this endpoint is an unauthenticated
// phone lookup, and a helper's email is the sensitive bit (phishing / account
// takeover). The self-service profile editor doesn't use it.
//
// The list is SPLIT so that a column this code knows about but the database
// does not can never cost a helper their account page. Edge functions
// auto-deploy on merge while migrations are applied BY HAND, so there is
// always a window where the two disagree — and on 2026-07-30 that window
// opened on `own_kit` and stayed open for five weeks: Postgres failed the
// WHOLE query with 42703, this endpoint 500'd, and /student-account texted a
// code, verified it, then dead-ended on "Verified — but we could not load
// your profile" for EVERY helper. (Found 2026-09-01 when a real ID-verified
// applicant gave up and WhatsApp'd the owner.) CORE is what the editor cannot
// render without; the rest are display flags worth degrading rather than
// denying someone their own profile over. Same failure shape as the
// 20260708020000 anon-grant bug — a column-level miss failing whole-query.
const CORE_COLUMNS =
  'id, name, phone, photo_url, city, bio, college, course, study_year, categories, availability, status, stripe_account_id, stripe_payouts_enabled, payment_handle';
const OPTIONAL_COLUMNS =
  'own_kit, student_email_verified, id_verified, verified_plan_active, vano_verified';
const PROFILE_COLUMNS = `${CORE_COLUMNS}, ${OPTIONAL_COLUMNS}`;

interface SelectResult {
  data: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
}

/**
 * Runs a profile SELECT, retrying once on 42703 (undefined_column) with the
 * core columns only. Loud in the logs, because a hit here means a migration
 * is pending — the degraded read is a safety net, not the fix.
 */
async function selectProfile(
  run: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<SelectResult> {
  const first = await run(PROFILE_COLUMNS) as SelectResult;
  if (first.error?.code !== '42703') return first;
  console.error(
    '[find-helper-by-phone] SELECT list is ahead of the database (42703) — ' +
    'serving the core profile without the optional flags. APPLY THE PENDING MIGRATION.',
    first.error,
  );
  return await run(CORE_COLUMNS) as SelectResult;
}

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

    let { data, error: dbErr } = await selectProfile((cols) =>
      supabase
        .from('household_helpers')
        .select(cols)
        .in('phone', [...variants])
        .neq('status', 'suspended')
        .limit(1)
        .maybeSingle());

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
          const { data: full, error: fullErr } = await selectProfile((cols) =>
            supabase
              .from('household_helpers')
              .select(cols)
              .eq('id', hit.id)
              .maybeSingle());
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

    // The profile only leaves the server for a code-verified session on this
    // exact row. (The row's existence was already knowable from the OTP send
    // step, but its contents were not.)
    if (!await hasAccountAccess(body?.account_token, (data as { id: string }).id)) {
      return bad(401, 'verification_required');
    }

    return new Response(JSON.stringify({ helper: data }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[find-helper-by-phone] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
