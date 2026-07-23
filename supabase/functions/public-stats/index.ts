import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public platform stats for the landing page's lowkey numbers (owner call
// 2026-07-23: "N students · N jobs booked" replaces the fat helpers-online
// pill). Service-role counts because anon can't read household_bookings —
// only aggregate NUMBERS ever leave this function, never rows.
//
// Honesty rules (same spirit as the old pill fix):
// - students = approved AND available helpers. Junk signups are born
//   unavailable until their email verifies, so they never inflate this.
// - jobs = real bookings only: cancelled and never-secured awaiting_payment
//   rows don't count.
//
// Fail-soft: any error → 200 with nulls, the UI just hides the line.
// Cached 5 min at the edge — the landing page must never wait on this.
//
// verify_jwt = false (pinned in config.toml) — public read-only aggregates.

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
function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
}

serve(async (req) => {
  const headers = {
    ...corsHeaders(req),
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const [helpersRes, jobsRes] = await Promise.all([
      supabase.from('household_helpers')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('is_available', true),
      supabase.from('household_bookings')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', '(cancelled,awaiting_payment)'),
    ]);
    return new Response(
      JSON.stringify({
        students: helpersRes.error ? null : (helpersRes.count ?? 0),
        jobs:     jobsRes.error    ? null : (jobsRes.count ?? 0),
      }),
      { headers },
    );
  } catch (err) {
    console.error('[public-stats] unhandled', err);
    return new Response(JSON.stringify({ students: null, jobs: null }), { headers });
  }
});
