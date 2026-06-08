import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cancels a helper's Stripe subscription and removes them from the platform.
// Called from StudentAccount when the helper taps "Leave VANO".

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
    const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return bad(401, 'Invalid session');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get helper row
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, email, status')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { id: string; email: string | null; status: string } | null };

    if (!helper) return bad(404, 'Helper account not found');

    // Cancel Stripe subscription (best-effort — DB update still proceeds on failure)
    if (stripeKey && helper.email) {
      try {
        // Find Stripe customer by email
        const custRes = await fetch(
          `https://api.stripe.com/v1/customers?email=${encodeURIComponent(helper.email)}&limit=1`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
        );
        const custData = await custRes.json() as { data?: Array<{ id: string }> };

        if (custData.data?.length) {
          const customerId = custData.data[0].id;

          // List active subscriptions
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=active&limit=10`,
            { headers: { Authorization: `Bearer ${stripeKey}` } },
          );
          const subData = await subRes.json() as { data?: Array<{ id: string }> };

          // Cancel each one
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

    // Remove from platform regardless of Stripe outcome
    await supabase
      .from('household_helpers')
      .update({ status: 'cancelled', is_available: false })
      .eq('id', helper.id);

    return ok({ cancelled: true });
  } catch (err) {
    console.error('[cancel-helper-subscription] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
