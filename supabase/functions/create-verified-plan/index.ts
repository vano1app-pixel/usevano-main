import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Opens the €2/month "VANO ✓ Verified" subscription checkout for a helper and
// returns the hosted URL. The blue tick = student email confirmed + Stripe ID
// check passed + this plan active (the DB's generated vano_verified column).
// Stripe returns to /verify-helper?vp=<session_id>, where the client calls
// confirm-verified-plan to record it; stripe-webhook is the backstop and also
// turns the plan off again on customer.subscription.deleted.
//
// The two free checks must be done FIRST (enforced here, not just in the UI):
// letting someone pay before email + ID pass would take €2/month for a tick
// that can't render — a refund complaint factory.

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
    if (!STRIPE_SECRET_KEY) return json(503, { error: 'Payments not configured. WhatsApp us: +353 89 981 7111' });

    const { helper_id } = await req.json() as { helper_id?: string };
    if (!helper_id) return json(400, { error: 'Missing helper id.' });

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, email, student_email_verified, id_verified, verified_plan_active')
      .eq('id', helper_id).maybeSingle() as {
        data: {
          id: string; email: string | null;
          student_email_verified: boolean | null; id_verified: boolean | null;
          verified_plan_active: boolean | null;
        } | null;
      };
    if (!helper) return json(404, { error: 'Account not found.' });
    if (helper.verified_plan_active) return json(200, { success: true, already_active: true });
    if (!helper.student_email_verified || !helper.id_verified) {
      return json(409, { error: 'Finish your student email and ID checks first — then the €2/month switches your tick on.' });
    }

    // Dedup before minting a new session: if this helper already has an ACTIVE
    // verified_plan subscription in Stripe (e.g. they completed checkout in
    // another tab / an earlier attempt whose confirm redirect never ran, so
    // verified_plan_active is still false), reuse it instead of creating a
    // second — a duplicate would orphan a subscription billing €2/mo that
    // cancel-verified-plan can't reach. Best-effort (Stripe's search index can
    // lag ~a minute; confirm-verified-plan's overwrite guard is the backstop).
    try {
      const q = `metadata['helper_id']:'${helper_id}' AND status:'active'`;
      const searchRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/search?query=${encodeURIComponent(q)}&limit=1`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
      );
      if (searchRes.ok) {
        const found = await searchRes.json() as { data?: Array<{ id: string }> };
        if (found.data && found.data.length > 0) {
          await supabase.from('household_helpers')
            .update({ verified_plan_active: true, verified_plan_sub_id: found.data[0].id })
            .eq('id', helper_id);
          return json(200, { success: true, already_active: true });
        }
      }
    } catch (e) {
      console.warn('[create-verified-plan] dedup search failed (non-fatal)', e);
    }

    const origin = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://vanojobs.com';
    const params: Record<string, string> = {
      mode: 'subscription',
      success_url: `${origin}/verify-helper?id=${helper_id}&vp={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/verify-helper?id=${helper_id}`,
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': '200',
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': 'VANO ✓ Verified',
      'line_items[0][quantity]': '1',
      // On the SESSION for the checkout.session.completed path, and on the
      // SUBSCRIPTION so customer.subscription.deleted can find the helper.
      'metadata[type]': 'verified_plan',
      'metadata[helper_id]': helper_id,
      'subscription_data[metadata][type]': 'verified_plan',
      'subscription_data[metadata][helper_id]': helper_id,
      ...(helper.email ? { customer_email: helper.email } : {}),
    };

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const session = await res.json() as { url?: string; error?: { message?: string } };
    if (!res.ok || !session.url) {
      console.error('[create-verified-plan] stripe error', session.error);
      return json(502, { error: session.error?.message || 'Could not open checkout.' });
    }
    return json(200, { success: true, url: session.url });
  } catch (err) {
    console.error('[create-verified-plan] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
