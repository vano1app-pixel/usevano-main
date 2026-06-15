import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// "House on autopilot" builder checkout. The customer ticks services and
// picks dates Airbnb-style; this function recomputes the price SERVER-SIDE
// (client numbers are display only) and opens Stripe Checkout:
//   - ongoing  → subscription, billed weekly or monthly per `billing`
//                (metadata.household_plan='autopilot'). Weekly is the
//                flexible tier; monthly saves ~10% vs week-by-week.
//   - away     → one-off payment for the date range
//                (metadata.household_plan='away-cover')
// Both land in the existing stripe-webhook household_plan handler, which
// records the row in household_plan_subscriptions, welcomes the customer
// and pings the admin to schedule — no webhook changes needed.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Single source of truth for autopilot pricing. The client mirrors these
// for display; anything else sent from the browser is ignored.
// Weekly prices sit ~10% above monthly pro-rata (monthly × 12 ÷ 52) so the
// monthly tier genuinely "saves ~10%" — flexibility costs a little, the
// commitment earns the discount. Weekly also prices away-cover weeks.
const SERVICES: Record<string, { label: string; monthlyCents: number; weeklyCents: number; ongoingOnly?: boolean }> = {
  cleaning: { label: 'Cleaning · 90-min refresh',       monthlyCents: 11900, weeklyCents: 3000 },
  laundry:  { label: 'Laundry & ironing',               monthlyCents:  5900, weeklyCents: 1500 },
  garden:   { label: 'Garden & lawn',                   monthlyCents:  5900, weeklyCents: 1500 },
  dog:      { label: 'Dog walks · weekly',              monthlyCents:  4500, weeklyCents: 1200 },
  bins:     { label: 'Bins out & house check',          monthlyCents:  1900, weeklyCents:  500 },
  plants:   { label: 'Plants & post',                   monthlyCents:  1500, weeklyCents:  400 },
  oddjobs:  { label: 'Odd-jobs hour · monthly',         monthlyCents:  1800, weeklyCents:    0, ongoingOnly: true },
  // Legacy — dropped from the builder, but stale PWA clients may still send it.
  grocery:  { label: 'Grocery collection',              monthlyCents:  4900, weeklyCents: 1200 },
};

const BUNDLE_DISCOUNT_MIN_SERVICES = 3;
const BUNDLE_DISCOUNT_FACTOR = 0.9; // −10%
const MAX_AWAY_WEEKS = 12;
// Floor: the smallest single pick (plants, €4/wk) must clear it.
const MIN_TOTAL_CENTS = 400;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json().catch(() => ({})) as {
      mode?: string;
      billing?: string;
      services?: string[];
      start_date?: string;
      end_date?: string;
      customer_name?: string;
      customer_phone?: string;
      city?: string;
    };

    const mode = body.mode === 'away' ? 'away' : 'ongoing';
    // Ongoing cadence: 'weekly' (flexible) or 'monthly' (save ~10%). Defaults
    // to monthly so older clients that never send `billing` are unaffected.
    const billing = mode === 'ongoing' && body.billing === 'weekly' ? 'weekly' : 'monthly';
    const name = body.customer_name?.trim();
    const phone = body.customer_phone?.trim();
    const city = body.city?.trim();
    if (!name || name.length < 2) return bad(400, 'Your name is required');
    if (!phone || phone.replace(/\D/g, '').length < 7) return bad(400, 'A valid phone number is required');

    const picked = [...new Set((body.services ?? []).filter((s) => {
      const svc = SERVICES[s];
      if (!svc) return false;
      if (mode === 'away' && svc.ongoingOnly) return false;
      // Weekly billing needs a weekly price (excludes monthly-only oddjobs)
      if (mode === 'ongoing' && billing === 'weekly' && svc.weeklyCents <= 0) return false;
      return true;
    }))];
    if (picked.length === 0) return bad(400, 'Pick at least one service');

    // ── Price, server-side only ────────────────────────────────────────────
    let weeks = 0;
    let baseCents = 0;
    if (mode === 'ongoing') {
      baseCents = picked.reduce(
        (sum, s) => sum + (billing === 'weekly' ? SERVICES[s].weeklyCents : SERVICES[s].monthlyCents),
        0,
      );
    } else {
      const from = body.start_date ? new Date(body.start_date) : null;
      const to = body.end_date ? new Date(body.end_date) : null;
      if (!from || !to || isNaN(+from) || isNaN(+to) || to <= from) {
        return bad(400, 'Pick valid from/to dates');
      }
      weeks = Math.min(MAX_AWAY_WEEKS, Math.max(1, Math.ceil((+to - +from) / (7 * 24 * 3600 * 1000))));
      baseCents = picked.reduce((sum, s) => sum + SERVICES[s].weeklyCents, 0) * weeks;
    }
    const bundled = picked.length >= BUNDLE_DISCOUNT_MIN_SERVICES;
    const totalCents = Math.round((bundled ? baseCents * BUNDLE_DISCOUNT_FACTOR : baseCents) / 50) * 50;
    if (totalCents < MIN_TOTAL_CENTS) return bad(400, 'Selection too small');

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(503, 'Payment not configured. WhatsApp us instead: +353 89 981 7111');

    const origin = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://vanojobs.com';
    const planKey = mode === 'ongoing' ? 'autopilot' : 'away-cover';
    const serviceLabels = picked.map((s) => SERVICES[s].label).join(' + ');
    const config = mode === 'ongoing'
      ? `${serviceLabels} · billed ${billing} · from ${body.start_date ?? 'asap'}${bundled ? ' · bundle −10%' : ''}`
      : `${serviceLabels} · ${body.start_date} → ${body.end_date} (${weeks}wk)${bundled ? ' · bundle −10%' : ''}`;

    const common: Record<string, string> = {
      success_url: `${origin}/?plan=success`,
      cancel_url: `${origin}/#plans`,
      'metadata[household_plan]': planKey,
      'metadata[plan_customer_name]': name.slice(0, 120),
      'metadata[plan_customer_phone]': phone.slice(0, 32),
      ...(city ? { 'metadata[plan_city]': city.slice(0, 60) } : {}),
      'metadata[autopilot_config]': config.slice(0, 480),
      'payment_method_types[0]': 'card',
    };

    const params: Record<string, string> =
      mode === 'ongoing'
        ? {
            ...common,
            mode: 'subscription',
            'line_items[0][price_data][currency]': 'eur',
            'line_items[0][price_data][unit_amount]': String(totalCents),
            'line_items[0][price_data][recurring][interval]': billing === 'weekly' ? 'week' : 'month',
            'line_items[0][price_data][product_data][name]': 'VANO House Autopilot',
            'line_items[0][price_data][product_data][description]': config.slice(0, 480),
            'line_items[0][quantity]': '1',
            'subscription_data[metadata][household_plan]': planKey,
            'subscription_data[metadata][plan_customer_phone]': phone.slice(0, 32),
          }
        : {
            ...common,
            mode: 'payment',
            'line_items[0][price_data][currency]': 'eur',
            'line_items[0][price_data][unit_amount]': String(totalCents),
            'line_items[0][price_data][product_data][name]': `VANO Away Cover · ${weeks} week${weeks > 1 ? 's' : ''}`,
            'line_items[0][price_data][product_data][description]': config.slice(0, 480),
            'line_items[0][quantity]': '1',
          };

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(params),
    });

    if (!resp.ok) {
      console.error('[create-autopilot-checkout] stripe error', resp.status, (await resp.text()).slice(0, 300));
      return bad(502, 'Could not open checkout — try again or WhatsApp us.');
    }

    const session = await resp.json() as { url?: string };
    if (!session.url) return bad(502, 'Could not open checkout — try again or WhatsApp us.');

    console.log(`[create-autopilot-checkout] ${planKey} €${(totalCents / 100).toFixed(2)} — ${config}`);
    return ok({ checkout_url: session.url, total_cents: totalCents });
  } catch (err) {
    console.error('[create-autopilot-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
