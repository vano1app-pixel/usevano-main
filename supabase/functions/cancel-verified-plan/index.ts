import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cancels a helper's €2/month ✓ Verified subscription — cancel-anytime is part
// of the deal (and EU consumer law). Auth: phone number verified against the
// helper row, same pattern as disconnect-helper-payouts. The subscription is
// set to cancel AT PERIOD END (they paid for the month, they keep the tick for
// the month); stripe-webhook's customer.subscription.deleted flips
// verified_plan_active off when Stripe actually ends it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const normalizePhone = (p: string) => p.replace(/[\s\-().+]/g, '').replace(/^0/, '353');
const phonesMatch = (a: string, b: string) => {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    const { helper_id, phone } = await req.json() as { helper_id?: string; phone?: string };
    if (!helper_id || !phone) return json(400, { error: 'helper_id and phone are required' });

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, phone, verified_plan_active, verified_plan_sub_id')
      .eq('id', helper_id).maybeSingle() as {
        data: { id: string; phone: string; verified_plan_active: boolean | null; verified_plan_sub_id: string | null } | null;
      };
    if (!helper) return json(404, { error: 'Account not found.' });
    if (!phonesMatch(helper.phone, phone)) return json(403, { error: 'Phone number does not match.' });
    if (!helper.verified_plan_active) return json(200, { cancelled: true, already_inactive: true });

    // No Stripe sub on file (grandfathered one-off €2 payers) — switch the
    // plan flag off directly; there is nothing recurring to cancel.
    if (!helper.verified_plan_sub_id) {
      const { error } = await supabase
        .from('household_helpers')
        .update({ verified_plan_active: false })
        .eq('id', helper_id);
      if (error) return json(500, { error: 'Could not cancel.' });
      return json(200, { cancelled: true, immediate: true });
    }

    if (!STRIPE_SECRET_KEY) return json(503, { error: 'Payments not configured.' });
    const res = await fetch(
      `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(helper.verified_plan_sub_id)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ cancel_at_period_end: 'true' }).toString(),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // Already cancelled/gone on Stripe's side — make our flag agree.
      if (res.status === 404 || detail.includes('No such subscription')) {
        await supabase.from('household_helpers')
          .update({ verified_plan_active: false, verified_plan_sub_id: null })
          .eq('id', helper_id);
        return json(200, { cancelled: true, immediate: true });
      }
      console.error('[cancel-verified-plan] stripe error', res.status, detail.slice(0, 300));
      return json(502, { error: 'Could not cancel with Stripe — try again or WhatsApp us.' });
    }

    // Tick stays on until the paid month runs out; the webhook turns it off.
    return json(200, { cancelled: true, ends_at_period_end: true });
  } catch (err) {
    console.error('[cancel-verified-plan] unhandled', err);
    return json(500, { error: 'Unexpected error' });
  }
});
