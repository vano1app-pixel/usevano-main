import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Creates a Stripe Checkout Session for the €1 AI Find purchase and an
// ai_find_requests row to track it. Returns { url } which the frontend
// redirects to. Payment confirmation happens in stripe-webhook, not on
// the success_url return — never trust the browser's word on "paid".

const AI_FIND_AMOUNT_CENTS = 100; // €1.00
const AI_FIND_CURRENCY = 'eur';

// Stripe requires form-urlencoded for REST calls. Arrays / nested
// objects use the square-bracket notation below (line_items[0][...]).
function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response => new Response(
    JSON.stringify({ error }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return bad(401, 'Unauthorized');
    }

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller identity via the attached JWT.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return bad(401, 'Unauthorized');
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const brief = typeof body?.brief === 'string' ? body.brief.trim() : '';
    const category = typeof body?.category === 'string' ? body.category.trim() || null : null;
    const budgetRange = typeof body?.budget_range === 'string' ? body.budget_range.trim() || null : null;
    const timeline = typeof body?.timeline === 'string' ? body.timeline.trim() || null : null;
    const location = typeof body?.location === 'string' ? body.location.trim() || null : null;

    if (!brief || brief.length < 10) {
      return bad(400, 'Brief is too short. Describe what you need in a sentence or two.');
    }
    if (brief.length > 4000) {
      return bad(400, 'Brief is too long. Trim to 4000 characters.');
    }

    // Resolve a safe return origin. Prefer the request origin so local
    // dev works; fall back to a repo-wide site URL env if deployed
    // behind a proxy that strips Origin.
    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    // Insert the pending request row first so we can stamp the Stripe
    // session id onto a row that already exists — avoids a race where
    // the webhook arrives before we've written the row back.
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: insertedRow, error: insertError } = await supabase
      .from('ai_find_requests')
      .insert({
        requester_id: userId,
        brief,
        category,
        budget_range: budgetRange,
        timeline,
        location,
        amount_eur: AI_FIND_AMOUNT_CENTS / 100,
        status: 'awaiting_payment',
      })
      .select('id')
      .single();

    if (insertError || !insertedRow) {
      console.error('[create-ai-find-checkout] insert failed', insertError);
      return bad(500, 'Could not start your request. Please try again.');
    }

    const requestId: string = insertedRow.id;

    // payment_method_types is intentionally omitted so Stripe
    // auto-enables Apple Pay + Google Pay (and other supported wallets
    // for the currency/geo) alongside card. The €1 entry point should
    // feel one-tap on mobile, not a form-fill.
    const checkoutParams: Record<string, string> = {
      mode: 'payment',
      'line_items[0][price_data][currency]': AI_FIND_CURRENCY,
      'line_items[0][price_data][unit_amount]': String(AI_FIND_AMOUNT_CENTS),
      'line_items[0][price_data][product_data][name]': 'Vano AI Find',
      'line_items[0][price_data][product_data][description]':
        'AI-matched freelancer for your brief. Results in under a minute.',
      'line_items[0][quantity]': '1',
      success_url: `${origin}/ai-find/${requestId}`,
      cancel_url: `${origin}/hire`,
      'metadata[ai_find_request_id]': requestId,
      'metadata[requester_id]': userId,
      // Show receipts — useful support hook + GDPR-friendly.
      // customer_email is left blank; Stripe Checkout will collect it
      // and forward to the webhook so we can correlate without
      // exposing the email to this function before payment.
      client_reference_id: requestId,
    };

    const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode(checkoutParams),
    });

    if (!stripeResp.ok) {
      const text = await stripeResp.text();
      console.error('[create-ai-find-checkout] stripe error', stripeResp.status, text);
      // Mark the row failed so the frontend doesn't leave a ghost
      // "awaiting_payment" forever.
      await supabase
        .from('ai_find_requests')
        .update({ status: 'failed', error_message: 'stripe_checkout_failed' })
        .eq('id', requestId);
      return bad(502, 'Payment provider error. Please try again.');
    }

    const session = await stripeResp.json() as { id: string; url: string };

    await supabase
      .from('ai_find_requests')
      .update({ stripe_session_id: session.id })
      .eq('id', requestId);

    return new Response(
      JSON.stringify({ url: session.url, id: requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-ai-find-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
