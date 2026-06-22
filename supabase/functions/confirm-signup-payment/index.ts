import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Confirms a helper's €2 sign-up fee from the Checkout session id Stripe
// returns to /verify-helper. Verifies the session is paid AND belongs to this
// helper (metadata.helper_id), then sets signup_paid. The DB trigger flips the
// helper to 'approved' once student email + ID + payment are all done; if this
// call is the one that completes the set, we notify them.

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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return json(503, { error: 'Payment not configured.' });

    const { helper_id, session_id } = await req.json() as { helper_id?: string; session_id?: string };
    if (!helper_id || !session_id) return json(400, { error: 'Missing helper id or session id.' });

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const session = await res.json() as { payment_status?: string; metadata?: { helper_id?: string } };
    if (!res.ok) return json(502, { error: 'Could not verify payment.' });

    // The session must be paid and tied to this helper — a helper can only
    // confirm their own session.
    if (session.payment_status !== 'paid' || session.metadata?.helper_id !== helper_id) {
      return json(200, { paid: false });
    }

    const { error } = await supabase.from('household_helpers').update({ signup_paid: true }).eq('id', helper_id);
    if (error) { console.error('[confirm-signup-payment] update failed', error); return json(500, { error: 'Could not record payment.' }); }

    // Did that complete the set (trigger flips to approved)? If so, ping them.
    const { data: row } = await supabase.from('household_helpers').select('status').eq('id', helper_id).maybeSingle();
    const approved = (row as { status?: string } | null)?.status === 'approved';
    if (approved) {
      fetch(`${supabaseUrl}/functions/v1/notify-helper-approved`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ helper_id }),
      }).catch(() => {/* non-critical */});
    }

    return json(200, { paid: true, approved });
  } catch (err) {
    console.error('[confirm-signup-payment] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
