import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Self-serve monthly plans: opens a Stripe subscription Checkout for the
// HomePlans section. Prices are server-authoritative; the client only sends
// a plan slug. stripe-webhook records the subscription + notifies admin and
// customer when checkout.session.completed (mode=subscription) lands.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const PLANS: Record<string, { cents: number; name: string; description: string }> = {
  'family': {
    cents: 8000,
    name: 'VANO Family Plan',
    description: 'Weekly help for a parent — grocery run, garden upkeep, friendly check-in',
  },
  'home-pass': {
    cents: 9900,
    name: 'VANO Home Pass',
    description: 'Weekly 2-hour visit — mix any jobs, same trusted helper, priority booking',
  },
  'family-plus': {
    cents: 14900,
    name: 'VANO Family Plus Plan',
    description: 'Twice-weekly visits — groceries, errands, garden & tech help, priority booking',
  },
};

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
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const body = await req.json().catch(() => ({}));
    const { plan, customer_name, customer_phone, city } = body;

    const planDef = typeof plan === 'string' ? PLANS[plan] : undefined;
    if (!planDef) return bad(400, 'Invalid plan');
    if (!customer_name?.trim()) return bad(400, 'customer_name is required');
    if (!customer_phone?.trim()) return bad(400, 'customer_phone is required');
    if (!/^\+?[\d\s\-().]{7,15}$/.test(customer_phone.trim())) {
      return bad(400, 'Please enter a valid phone number');
    }

    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    const cityVal = typeof city === 'string' && city.trim() ? city.trim().slice(0, 80) : '';

    const params: Record<string, string> = {
      mode: 'subscription',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(planDef.cents),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': planDef.name,
      'line_items[0][price_data][product_data][description]': planDef.description,
      'line_items[0][quantity]': '1',
      'phone_number_collection[enabled]': 'true',
      success_url: `${origin}/?plan=success`,
      cancel_url: `${origin}/#plans`,
      // Session metadata → stripe-webhook records + notifies on completion
      'metadata[household_plan]': plan,
      'metadata[plan_customer_name]': customer_name.trim().slice(0, 120),
      'metadata[plan_customer_phone]': customer_phone.trim().slice(0, 32),
      ...(cityVal ? { 'metadata[plan_city]': cityVal } : {}),
      // Mirror onto the subscription object so cancellation events carry it
      'subscription_data[metadata][household_plan]': plan,
      'subscription_data[metadata][plan_customer_phone]': customer_phone.trim().slice(0, 32),
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(params),
    });

    if (!stripeResp.ok) {
      console.error('[create-plan-checkout] stripe error', stripeResp.status, (await stripeResp.text()).slice(0, 300));
      return bad(502, 'Payment provider error. Please try again.');
    }

    const session = await stripeResp.json() as { id: string; url: string };

    return new Response(
      JSON.stringify({ checkout_url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-plan-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
