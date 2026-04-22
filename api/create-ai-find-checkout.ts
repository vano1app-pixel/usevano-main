// Vercel serverless function — mints a Stripe Checkout Session for
// the €1 AI Find purchase and returns the session URL.
//
// Replaces the Stripe Payment Link flow. Payment Links can only
// templatize {CHECKOUT_SESSION_ID} into the success URL, which forced
// us into a /ai-find-return page with localStorage hand-off + webhook
// polling + post-auth stashing — four layers of fragile state to work
// around one Stripe limitation. A real Checkout Session can put the
// row id directly in the success URL, so we redirect the hirer from
// Stripe straight to their match page. Zero hand-off.
//
// We keep the "client inserts the row via RLS" split (see
// HirePage.handleAiFind + migration 20260422120000_ai_find_client_insert.sql)
// so this endpoint doesn't need the service role key on Vercel. It
// verifies the JWT, confirms the row belongs to the caller, creates
// the session, and stamps stripe_session_id back onto the row so the
// webhook can correlate even if the user comes back via a quirky path.
//
// Why not the existing supabase/functions/create-ai-find-checkout:
// the Supabase edge gateway has been 401-ing valid JWTs on this
// project (see vano_supabase_gateway_issue memory). Moving the
// Stripe call to Vercel removes the gateway from the critical path.

// Minimal Node globals — /api isn't in any tsconfig include path, so
// the editor checks this file against the browser TS lib and doesn't
// know about `process`. Vercel's build bundles this with Node types;
// this shim just keeps the IDE quiet.
declare const process: { env: Record<string, string | undefined> };

type VercelReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

type VercelRes = {
  status: (code: number) => VercelRes;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const SITE_URL = (process.env.SITE_URL || 'https://vanojobs.com').replace(/\/+$/, '');

const AI_FIND_AMOUNT_CENTS = 100;
const AI_FIND_CURRENCY = 'eur';

function readHeader(headers: VercelReq['headers'], name: string): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === 'string' ? v : null;
}

// Stripe's REST API uses form-urlencoded with square-bracket notation
// for nested fields. Matches the pattern already used by the edge
// function version.
function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function supabaseRest<T = unknown>(
  path: string,
  jwt: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error(`[create-ai-find-checkout] supabase ${path} failed`, resp.status, text);
    return { ok: false, status: resp.status, data: null };
  }
  if (!text) return { ok: true, status: resp.status, data: null };
  try {
    return { ok: true, status: resp.status, data: JSON.parse(text) as T };
  } catch {
    return { ok: true, status: resp.status, data: null };
  }
}

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase env not configured' });
  }
  if (!STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe env not configured' });
  }

  const auth = readHeader(req.headers, 'authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const jwt = auth.slice('Bearer '.length).trim();
  if (!jwt) return res.status(401).json({ error: 'Empty bearer token' });

  const body = (req.body ?? {}) as { request_id?: string };
  const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    return res.status(400).json({ error: 'Invalid request_id' });
  }

  // 1. Verify JWT and fetch user email in one call.
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userResp.ok) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
  const userData = (await userResp.json()) as { id?: string; email?: string };
  if (!userData?.id) {
    return res.status(401).json({ error: 'Auth token missing identity' });
  }

  // 2. Confirm the row belongs to the caller and is still in a state
  //    where it makes sense to pay. RLS already guarantees ownership,
  //    but we read the status too so we can 409 on a paid/complete
  //    row rather than minting a duplicate session.
  const rowResp = await supabaseRest<Array<{ id: string; requester_id: string; status: string; brief: string | null }>>(
    `ai_find_requests?id=eq.${encodeURIComponent(requestId)}&select=id,requester_id,status,brief`,
    jwt,
  );
  const row = rowResp.data?.[0];
  if (!row) {
    return res.status(404).json({ error: 'Request not found' });
  }
  if (row.requester_id !== userData.id) {
    return res.status(403).json({ error: 'Not your request' });
  }
  if (row.status !== 'awaiting_payment') {
    // Already paid / scouting / complete — don't create another
    // session. The client should route to /ai-find/:id directly.
    return res.status(409).json({ error: 'Request is not awaiting payment', status: row.status });
  }
  if (!row.brief || row.brief.trim().length < 10) {
    return res.status(400).json({ error: 'Brief is too short' });
  }

  // 3. Create the Stripe Checkout Session. success_url routes back to
  //    the match page with the row id baked into the path — no
  //    /ai-find-return hop needed. We still pass {CHECKOUT_SESSION_ID}
  //    so AiFindResults can stamp a trust token and self-heal if the
  //    webhook lags.
  const params: Record<string, string> = {
    mode: 'payment',
    'line_items[0][price_data][currency]': AI_FIND_CURRENCY,
    'line_items[0][price_data][unit_amount]': String(AI_FIND_AMOUNT_CENTS),
    'line_items[0][price_data][product_data][name]': 'Vano AI Find',
    'line_items[0][price_data][product_data][description]':
      'AI-matched freelancer for your brief. Results in under a minute.',
    'line_items[0][quantity]': '1',
    'metadata[ai_find_request_id]': row.id,
    'metadata[requester_id]': userData.id,
    client_reference_id: row.id,
    success_url: `${SITE_URL}/ai-find/${row.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/hire`,
  };
  if (userData.email) {
    params['customer_email'] = userData.email;
  }

  const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formEncode(params),
  });

  if (!stripeResp.ok) {
    const text = await stripeResp.text();
    console.error('[create-ai-find-checkout] stripe error', stripeResp.status, text);
    return res.status(502).json({ error: 'Payment provider error' });
  }

  const session = (await stripeResp.json()) as { id?: string; url?: string };
  if (!session?.id || !session.url) {
    console.error('[create-ai-find-checkout] unexpected stripe response', session);
    return res.status(502).json({ error: 'Payment provider returned no URL' });
  }

  // Intentionally not PATCH-ing stripe_session_id onto the row here.
  // The user-level RLS update policy (ai_find_requests_update_requester_complete)
  // forces status='complete' on any owner-initiated update, so we can't
  // stamp the session id under the caller's JWT. And we don't need to:
  // the webhook correlates on client_reference_id + metadata.ai_find_request_id,
  // and /ai-find/:id self-heals off a sessionStorage trust token derived
  // from the session_id query param in the success URL — neither path
  // reads ai_find_requests.stripe_session_id. The stripe-webhook still
  // stamps it server-side once the event lands.

  return res.status(200).json({ url: session.url, id: row.id });
}
