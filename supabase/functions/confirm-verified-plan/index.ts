import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Confirms a helper's €2/month ✓ Verified subscription from the Checkout
// session id Stripe returns to /verify-helper?vp=… — the same webhook-
// independent close-the-loop trick confirm-signup-payment uses for the old
// one-off €2. Verifies the session is PAID and belongs to THIS helper
// (metadata.helper_id) before flipping verified_plan_active.

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
    if (!STRIPE_SECRET_KEY) return json(503, { error: 'Payments not configured.' });

    const { helper_id, session_id } = await req.json() as { helper_id?: string; session_id?: string };
    if (!helper_id || !session_id) return json(400, { error: 'Missing helper id or session id.' });

    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const session = await res.json() as {
      payment_status?: string;
      subscription?: string;
      metadata?: { helper_id?: string; type?: string };
    };
    if (!res.ok) return json(502, { error: 'Could not verify payment.' });

    // Paid, the right product, and tied to this helper — nothing else counts.
    if (
      session.payment_status !== 'paid' ||
      session.metadata?.type !== 'verified_plan' ||
      session.metadata?.helper_id !== helper_id
    ) {
      return json(200, { active: false });
    }

    const { error } = await supabase
      .from('household_helpers')
      .update({ verified_plan_active: true, ...(session.subscription ? { verified_plan_sub_id: session.subscription } : {}) })
      .eq('id', helper_id);
    if (error) { console.error('[confirm-verified-plan] update failed', error); return json(500, { error: 'Could not record your plan.' }); }

    return json(200, { active: true });
  } catch (err) {
    console.error('[confirm-verified-plan] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
