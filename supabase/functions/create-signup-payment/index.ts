import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Opens a €2 Stripe Checkout for a helper's sign-up fee and returns the hosted
// URL. Stripe returns to /verify-helper?sp=<session_id>, where the client calls
// confirm-signup-payment to record it. Paying is one of the three gates to go
// live (student email + ID + fee).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return json(503, { error: 'Payment not configured. WhatsApp us: +353 89 981 7111' });

    const { helper_id } = await req.json() as { helper_id?: string };
    if (!helper_id) return json(400, { error: 'Missing helper id.' });

    const { data: helper } = await supabase
      .from('household_helpers').select('id, email, signup_paid').eq('id', helper_id).maybeSingle();
    if (!helper) return json(404, { error: 'Application not found.' });
    if (helper.signup_paid) return json(200, { success: true, already_paid: true });

    const origin = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://vanojobs.com';
    const params: Record<string, string> = {
      mode: 'payment',
      success_url: `${origin}/verify-helper?id=${helper_id}&sp={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/verify-helper?id=${helper_id}`,
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': '200',
      'line_items[0][price_data][product_data][name]': 'VANO helper sign-up',
      'line_items[0][quantity]': '1',
      'metadata[type]': 'helper_signup',
      'metadata[helper_id]': helper_id,
      ...(helper.email ? { customer_email: helper.email as string } : {}),
    };

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const session = await res.json() as { url?: string; error?: { message?: string } };
    if (!res.ok || !session.url) {
      console.error('[create-signup-payment] stripe error', session.error);
      return json(502, { error: session.error?.message || 'Could not open checkout.' });
    }
    return json(200, { success: true, url: session.url });
  } catch (err) {
    console.error('[create-signup-payment] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
