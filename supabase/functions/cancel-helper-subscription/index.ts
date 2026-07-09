import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cancels a helper's Stripe subscription and removes them from the platform.
// Auth: phone number verified against helper_id (no Supabase auth account required).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const normalizePhone = (p: string) => p.replace(/[\s\-().+]/g, '').replace(/^0/, '353');
const phonesMatch = (a: string, b: string) => {
  const na = normalizePhone(a), nb = normalizePhone(b);
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

    const body = await req.json() as { helper_id?: string; phone?: string };
    const { helper_id, phone } = body;
    if (!helper_id || !phone) return bad(400, 'helper_id and phone are required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Load helper and verify phone matches
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, phone, email, status, verified_plan_sub_id')
      .eq('id', helper_id)
      .maybeSingle() as { data: { id: string; phone: string; email: string | null; status: string; verified_plan_sub_id: string | null } | null };

    if (!helper) return bad(404, 'Helper account not found');
    if (!phonesMatch(helper.phone, phone)) return bad(403, 'Phone number does not match');

    // Cancel the ✓ Verified €2/month subscription by its STORED id first —
    // the email sweep below only works when the Stripe customer's email
    // matches the helper row, and a stale/changed email left the sub billing
    // forever after the helper had gone. Leaving the platform ends the plan
    // immediately (no tick to keep).
    if (stripeKey && helper.verified_plan_sub_id) {
      await fetch(`https://api.stripe.com/v1/subscriptions/${helper.verified_plan_sub_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${stripeKey}` },
      }).catch((e) => console.warn('[cancel-helper-subscription] sub-id cancel failed (email sweep still runs):', e));
    }

    // Belt-and-braces email sweep (best-effort — DB update still proceeds on failure)
    if (stripeKey && helper.email) {
      try {
        const custRes = await fetch(
          `https://api.stripe.com/v1/customers?email=${encodeURIComponent(helper.email)}&limit=1`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
        );
        const custData = await custRes.json() as { data?: Array<{ id: string }> };

        if (custData.data?.length) {
          const customerId = custData.data[0].id;
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=10`,
            { headers: { Authorization: `Bearer ${stripeKey}` } },
          );
          const subData = await subRes.json() as { data?: Array<{ id: string }> };
          for (const sub of (subData.data ?? [])) {
            await fetch(`https://api.stripe.com/v1/subscriptions/${sub.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${stripeKey}` },
            }).catch(() => {});
          }
        }
      } catch (stripeErr) {
        console.warn('[cancel-helper-subscription] Stripe cancel error (non-fatal):', stripeErr);
      }
    }

    // Remove from platform regardless of Stripe outcome. Also switch the paid
    // plan flags off so nothing keeps rendering a tick for a cancelled row.
    await supabase
      .from('household_helpers')
      .update({ status: 'cancelled', is_available: false, verified_plan_active: false, verified_plan_sub_id: null })
      .eq('id', helper.id);

    return ok({ cancelled: true });
  } catch (err) {
    console.error('[cancel-helper-subscription] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
