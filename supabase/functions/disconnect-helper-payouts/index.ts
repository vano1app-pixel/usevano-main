import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { phonesMatch } from "../_shared/phoneMatch.ts";

// Lets a household helper disconnect their Stripe Connect payout account from
// /student-account. Auth: phone number verified against helper_id — the same
// model as cancel-helper-subscription / update-helper-profile, since most
// helpers are phone-gated only (no Supabase auth session).
//
// Best-effort deletes the Stripe Express account, then clears the link on
// household_helpers so a later "Set up payouts" starts a fresh account. Any
// earnings still 'pending' stay pending and simply wait for the helper to
// re-onboard — money is never lost by disconnecting.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

    const body = await req.json().catch(() => ({})) as { helper_id?: string; phone?: string };
    const { helper_id, phone } = body;
    if (!helper_id || !phone) return bad(400, 'helper_id and phone are required');

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, phone, stripe_account_id')
      .eq('id', helper_id)
      .maybeSingle() as { data: { id: string; phone: string; stripe_account_id: string | null } | null };

    if (!helper) return bad(404, 'Helper account not found');
    if (!phonesMatch(helper.phone, phone)) return bad(403, 'Phone number does not match');

    if (!helper.stripe_account_id) return ok({ disconnected: true }); // already disconnected — idempotent

    // Best-effort: delete the Stripe Express account. If Stripe refuses (e.g. an
    // outstanding balance), we still unlink locally so the helper can start
    // fresh; the owner can clean up the orphaned account from the dashboard.
    if (stripeKey) {
      try {
        await fetch(`https://api.stripe.com/v1/accounts/${helper.stripe_account_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
      } catch (e) {
        console.warn('[disconnect-helper-payouts] Stripe account delete failed (non-fatal):', e);
      }
    }

    const { error: updErr } = await supabase
      .from('household_helpers')
      .update({ stripe_account_id: null, stripe_payouts_enabled: false })
      .eq('id', helper.id);
    if (updErr) {
      console.error('[disconnect-helper-payouts] unlink failed', updErr);
      return bad(500, 'Could not disconnect payouts');
    }

    return ok({ disconnected: true });
  } catch (err) {
    console.error('[disconnect-helper-payouts] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
