import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Starts a Stripe Identity verification (document + matching selfie) for a
// helper and returns the hosted URL to redirect them to. The result lands
// asynchronously via stripe-identity-webhook, which flips id_verified.
//
// Requires Stripe Identity to be enabled on the account. Uses the REST API
// directly (matching the other Stripe functions — no SDK).

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
    if (!STRIPE_SECRET_KEY) return json(503, { error: 'ID checks not configured. WhatsApp us: +353 89 981 7111' });

    const { helper_id } = await req.json() as { helper_id?: string };
    if (!helper_id) return json(400, { error: 'Missing helper id.' });

    const { data: helper } = await supabase
      .from('household_helpers').select('id, name').eq('id', helper_id).maybeSingle();
    if (!helper) return json(404, { error: 'Application not found.' });

    const origin = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://vanojobs.com';

    const params = new URLSearchParams();
    params.set('type', 'document');
    params.set('options[document][require_matching_selfie]', 'true');
    params.set('options[document][require_live_capture]', 'true');
    params.set('metadata[helper_id]', helper_id);
    params.set('return_url', `${origin}/verify-helper?id=${helper_id}&id_check=done`);

    const res = await fetch('https://api.stripe.com/v1/identity/verification_sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const session = await res.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!res.ok || !session.url || !session.id) {
      console.error('[create-identity-verification] stripe error', session.error);
      return json(502, { error: session.error?.message || 'Could not start ID check.' });
    }

    await supabase.from('household_helpers')
      .update({ identity_session_id: session.id, identity_status: 'processing' })
      .eq('id', helper_id);

    return json(200, { success: true, url: session.url });
  } catch (err) {
    console.error('[create-identity-verification] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
