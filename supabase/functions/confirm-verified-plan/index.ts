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

    // expand[]=subscription so the sub id is always present on a completed
    // subscription-mode session (it can come back as a string or an object).
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}?expand[]=subscription`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    const session = await res.json() as {
      payment_status?: string;
      subscription?: string | { id?: string } | null;
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

    // ALWAYS record the subscription id. Recording the plan active with a
    // null verified_plan_sub_id left no handle to cancel the live Stripe
    // subscription later — cancel-verified-plan's no-sub branch would flip
    // the flag off while Stripe kept billing €2/month forever.
    const subId = typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id ?? null;
    if (!subId) console.error('[confirm-verified-plan] paid session with no subscription id', session_id);

    // Duplicate-subscription guard: if this helper ALREADY has a recorded sub id
    // and it differs from this session's, they completed checkout twice. Don't
    // overwrite (that orphans the first sub — cancel-verified-plan only knows
    // the recorded one, so the orphan would bill €2/mo forever). Cancel THIS
    // extra subscription and keep the recorded one.
    const { data: existing } = await supabase
      .from('household_helpers')
      .select('verified_plan_sub_id')
      .eq('id', helper_id)
      .maybeSingle() as { data: { verified_plan_sub_id: string | null } | null };
    const recorded = existing?.verified_plan_sub_id ?? null;
    if (recorded && subId && recorded !== subId) {
      await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      }).catch((e) => console.error('[confirm-verified-plan] duplicate sub cancel failed', subId, e));
      // Plan is already active on the recorded sub — nothing else to record.
      await supabase.from('household_helpers').update({ verified_plan_active: true }).eq('id', helper_id);
      return json(200, { active: true, deduped: true });
    }

    const { error } = await supabase
      .from('household_helpers')
      .update({ verified_plan_active: true, ...(subId ? { verified_plan_sub_id: subId } : {}) })
      .eq('id', helper_id);
    if (error) { console.error('[confirm-verified-plan] update failed', error); return json(500, { error: 'Could not record your plan.' }); }

    return json(200, { active: true });
  } catch (err) {
    console.error('[confirm-verified-plan] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
