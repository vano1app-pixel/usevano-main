import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// ── Inlined CORS (same allowlist as create-household-payment-checkout) ──────
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
// ───────────────────────────────────────────────────────────────────────────

// The "name any job" AI brain. The CustomJobBuilder posts the customer's
// free-text request plus its own job catalogue; this grounds Gemini so the
// model can only return a job key the frontend knows, estimate a sensible
// duration, and pull out a "when" if one was mentioned.
//
// It is deliberately FAIL-SOFT: every non-happy path (no key, rate limit,
// timeout, bad output) returns HTTP 200 with { ok: false }. The frontend then
// silently keeps its instant offline keyword matcher, so the AI can only ever
// make the experience better — never break or block a booking.
//
// Pricing is NOT decided here. The booking is still re-priced server-side at
// €18/hr × hours in create-household-payment-checkout, so a wrong AI guess
// can never charge under minimum wage; `hours` is only a starting default the
// customer can change.

const MODEL = 'gemini-2.0-flash';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

interface CatalogueJob { key: string; label: string; typicalHours?: number }

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  // Soft "no result" — frontend falls back to its keyword matcher. Always 200
  // so supabase.functions.invoke doesn't surface an error to the customer.
  const soft = (reason: string): Response => json(200, { ok: false, reason });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return json(403, { ok: false, reason: 'forbidden_origin' });
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'method' });

  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 400) : '';
    const rawJobs = Array.isArray(body.jobs) ? body.jobs : [];

    if (text.length < 4) return soft('too_short');

    // Sanitise the catalogue the client sent (key + label only; cap the size).
    const jobs: CatalogueJob[] = rawJobs
      .filter((j: unknown): j is CatalogueJob =>
        !!j && typeof (j as CatalogueJob).key === 'string' && typeof (j as CatalogueJob).label === 'string')
      .slice(0, 80)
      .map((j: CatalogueJob) => ({ key: j.key.slice(0, 40), label: j.label.slice(0, 80) }));
    if (jobs.length === 0) return soft('no_catalogue');

    const allowedKeys = new Set(jobs.map(j => j.key));
    if (!allowedKeys.has('other')) allowedKeys.add('other');

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) return soft('no_key');

    const catalogue = jobs.map(j => `- ${j.key}: ${j.label}`).join('\n');
    const system =
      "You are the intake brain for VANO, a same-day student-help service in Galway, Ireland. " +
      "A homeowner describes a household job in their own words. Map it to EXACTLY ONE job from " +
      "the provided catalogue, by its key. Estimate how many hours of ONE student's time it " +
      "realistically needs as a whole number 1-8 (be practical: most domestic jobs are 1-4 hours). " +
      "If the message states or implies WHEN they want it (e.g. 'today', 'tomorrow morning', " +
      "'this weekend', 'Saturday', 'next Friday afternoon'), copy that wording into whenText; " +
      "otherwise leave whenText empty. Write a short, friendly title naming the job (max 8 words). " +
      "If nothing in the catalogue is a reasonable fit, use the key 'other'. Always call the tool.";
    const user = `Catalogue (key: label):\n${catalogue}\n\nThe customer wrote:\n"""${text}"""`;

    // Don't let a slow model hang the typing experience.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let resp: Response;
    try {
      resp = await fetch(GEMINI_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          tools: [{
            type: 'function',
            function: {
              name: 'classify_job',
              description: 'Return the best-fit catalogue job, a duration estimate, any stated timing, and confidence.',
              parameters: {
                type: 'object',
                properties: {
                  jobKey:     { type: 'string', enum: [...allowedKeys], description: 'The catalogue key of the best-fit job, or "other".' },
                  hours:      { type: 'integer', minimum: 1, maximum: 8, description: "Whole hours of one student's time." },
                  title:      { type: 'string', description: 'Short friendly title naming the job (max 8 words).' },
                  whenText:   { type: 'string', description: 'The timing the customer stated, verbatim-ish; empty string if none.' },
                  confidence: { type: 'number', minimum: 0, maximum: 1, description: 'How confident the mapping is (0-1).' },
                },
                required: ['jobKey', 'hours', 'title', 'confidence'],
                additionalProperties: false,
              },
            },
          }],
          tool_choice: { type: 'function', function: { name: 'classify_job' } },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      console.warn('[parse-custom-job] gemini non-2xx', resp.status);
      return soft(resp.status === 429 ? 'rate_limited' : 'ai_error');
    }

    const data = await resp.json().catch(() => null);
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return soft('no_tool_call');

    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(args); } catch { return soft('bad_json'); }

    // Validate / clamp everything before trusting it.
    let jobKey = typeof parsed.jobKey === 'string' ? parsed.jobKey : 'other';
    if (!allowedKeys.has(jobKey)) jobKey = 'other';
    let hours = Math.round(Number(parsed.hours));
    if (!Number.isFinite(hours)) hours = jobs.find(j => j.key === jobKey)?.typicalHours ?? 2;
    hours = Math.min(8, Math.max(1, hours));
    const title = typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim().slice(0, 80)
      : (jobs.find(j => j.key === jobKey)?.label ?? 'Custom job');
    const whenText = typeof parsed.whenText === 'string' && parsed.whenText.trim()
      ? parsed.whenText.trim().slice(0, 80)
      : null;
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.6;
    confidence = Math.min(1, Math.max(0, confidence));

    return json(200, { ok: true, source: 'ai', jobKey, hours, title, whenText, confidence });
  } catch (err) {
    console.error('[parse-custom-job] unhandled', err);
    return soft('exception');
  }
});
