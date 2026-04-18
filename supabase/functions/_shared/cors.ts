// Shared CORS helper. Paid endpoints (Gemini, Lovable, Serper, Stripe
// session creation) gate on the Origin header so a wildcard CORS config
// can't be weaponised to burn our API quotas from a third-party page.
//
// Allowlist comes from the ALLOWED_ORIGINS Supabase Function secret
// (comma-separated). Falls back to the production + preview domains
// plus localhost for dev.

const FALLBACK_ORIGINS = [
  'https://vanojobs.com',
  'https://www.vanojobs.com',
  'http://localhost:5173',
  'http://localhost:4173',
];

const ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-supabase-client-platform',
  'x-supabase-client-platform-version',
  'x-supabase-client-runtime',
  'x-supabase-client-runtime-version',
].join(', ');

function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  if (!raw) return FALLBACK_ORIGINS;
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function allowsVercelPreview(origin: string): boolean {
  // Preview builds on this Vercel team land on *.vercel.app subdomains;
  // let them through so PR reviewers can exercise the functions.
  try {
    const host = new URL(origin).hostname;
    return host.endsWith('-vano1app-pixels-projects.vercel.app');
  } catch {
    return false;
  }
}

export function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const normalised = origin.replace(/\/$/, '');
  const allowlist = getAllowlist();
  if (allowlist.includes(normalised)) return normalised;
  if (allowsVercelPreview(normalised)) return normalised;
  return null;
}

/**
 * Build CORS headers for a response. When the Origin is allowlisted we
 * echo it back; otherwise we return a deliberately-mismatched value so
 * the browser rejects the response (and the request never leaves the
 * user's tab on subsequent calls).
 */
export function buildCorsHeaders(req: Request): Record<string, string> {
  const matched = matchOrigin(req);
  return {
    'Access-Control-Allow-Origin': matched ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    Vary: 'Origin',
  };
}

/**
 * True when the incoming request's Origin is on the allowlist. Paid
 * endpoints should call this early and 403 so we don't burn API quota
 * on requests the browser would reject anyway.
 */
export function isOriginAllowed(req: Request): boolean {
  // Same-origin fetches (no Origin header, e.g. server-to-server,
  // Supabase cron, Stripe webhook retries hitting via curl) are allowed
  // through — the auth layer downstream enforces the real boundary.
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}
