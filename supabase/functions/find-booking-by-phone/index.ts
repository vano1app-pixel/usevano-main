import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";

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
    const rawPhone = typeof body?.customer_phone === 'string' ? body.customer_phone.trim() : '';
    if (!rawPhone) return bad(400, 'customer_phone required');

    // Normalise: strip spaces, dashes, dots; keep leading +
    const phone = rawPhone.replace(/[\s\-().]/g, '');
    if (phone.replace(/\D/g, '').length < 7) return bad(400, 'Invalid phone number');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: this returns booking ids from a phone number, so throttle it
    // hard to stop mass enumeration of who has bookings.
    if (!await allowRequest(supabase, 'find-booking-by-phone', clientIp(req), 10, 600)) {
      return bad(429, 'Too many lookups — please wait a minute and try again.');
    }

    // Look up by exact phone OR with/without leading country code variations
    // e.g. "0831234567" and "+353831234567" and "353831234567"
    const variants = new Set<string>([phone]);
    if (phone.startsWith('+353')) {
      variants.add('0' + phone.slice(4));       // +353831234567 → 0831234567
      variants.add(phone.slice(1));             // +353831234567 → 353831234567
    } else if (phone.startsWith('353')) {
      variants.add('+' + phone);                // 353831234567 → +353831234567
      variants.add('0' + phone.slice(3));       // 353831234567 → 0831234567
    } else if (phone.startsWith('0')) {
      variants.add('+353' + phone.slice(1));    // 0831234567 → +353831234567
      variants.add('353' + phone.slice(1));     // 0831234567 → 353831234567
    }

    const { data, error: dbErr } = await supabase
      .from('household_bookings')
      .select('id, category, status, scheduled_date, created_at')
      .in('customer_phone', [...variants])
      .not('status', 'eq', 'awaiting_payment')
      .order('created_at', { ascending: false })
      .limit(5);

    if (dbErr) {
      console.error('[find-booking-by-phone]', dbErr);
      return bad(500, 'Database error');
    }

    return new Response(JSON.stringify(data ?? []), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[find-booking-by-phone] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
