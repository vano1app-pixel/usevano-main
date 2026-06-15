import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Creates (or retrieves) a Stripe Connect Express account for the
// calling household helper and returns a hosted onboarding URL. The
// helper links their bank account or Revolut (any IBAN works) with
// Stripe directly — we never see those details. On return,
// stripe-webhook listens for account.updated events and flips
// household_helpers.stripe_payouts_enabled once Stripe confirms the
// account is payout-ready, and release-household-payouts sweeps any
// earnings that piled up as 'pending' while they hadn't onboarded.
//
// Mirrors create-stripe-connect-link (Express / IE / EUR, same auth
// method, same idempotent reuse of an existing account id). The only
// difference is the row it reads/writes: household_helpers keyed by
// user_id instead of student_profiles.
//
// verify_jwt defaults to true (this function is intentionally absent
// from config.toml, exactly like create-stripe-connect-link) AND we
// re-verify the caller's JWT inside the function.

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

    // Verify caller — same getClaims pattern as create-stripe-connect-link.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return bad(401, 'Unauthorized');
    }
    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string | undefined;

    const supabase = createClient(supabaseUrl, serviceKey);

    // The helper's Connect account lives on their household_helpers row.
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (!helper) {
      return bad(404, 'No helper account found for this user. Apply to join VANO first.');
    }

    // Status-sync mode: the payout card calls this with { check_only: true }
    // after the helper returns from onboarding to confirm readiness directly
    // with Stripe (so it shows "active" even if the account.updated webhook
    // isn't wired up). It never creates an account or onboarding link.
    const reqBody = await req.json().catch(() => ({}));
    if (reqBody?.check_only === true) {
      let enabled = !!helper.stripe_payouts_enabled;
      const existingAccount = helper.stripe_account_id as string | null;
      if (existingAccount && !enabled) {
        try {
          const acctResp = await fetch(`https://api.stripe.com/v1/accounts/${existingAccount}`, {
            headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
          });
          if (acctResp.ok) {
            const acct = await acctResp.json() as { payouts_enabled?: boolean };
            enabled = !!acct.payouts_enabled;
            if (enabled) {
              await supabase.from('household_helpers').update({ stripe_payouts_enabled: true }).eq('user_id', userId);
            }
          }
        } catch (_e) { /* non-fatal — card falls back to its cached state */ }
      }
      return new Response(
        JSON.stringify({ stripe_account_id: helper.stripe_account_id ?? null, stripe_payouts_enabled: enabled }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    // Create a Connect Express account if one doesn't exist yet.
    let accountId = (helper.stripe_account_id as string | null) ?? null;
    if (!accountId) {
      const accountParams: Record<string, string> = {
        type: 'express',
        // Ireland-default. Stripe Express + EUR; the helper links any
        // IBAN (bank or Revolut) during onboarding.
        country: 'IE',
        'capabilities[transfers][requested]': 'true',
        'capabilities[card_payments][requested]': 'true',
        business_type: 'individual',
        'metadata[vano_user_id]': userId,
        'metadata[household_helper_id]': String(helper.id),
      };
      if (userEmail) accountParams.email = userEmail;

      const resp = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formEncode(accountParams),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('[household-helper-connect-link] account creation failed', resp.status, text);
        return bad(
          502,
          text.includes('signed up for Connect')
            ? 'Stripe Connect is not enabled on this platform yet. Owner: enable it in Stripe Dashboard → Connect.'
            : 'Could not start payout setup. Please try again.',
        );
      }
      const account = await resp.json() as { id: string };
      accountId = account.id;

      await supabase
        .from('household_helpers')
        .update({ stripe_account_id: accountId })
        .eq('user_id', userId);
    }

    // Mint a one-time onboarding link (expires after ~5 min of
    // inactivity, so we never persist it). Returns the helper to the
    // dashboard, where HouseholdHelperVanoPayCard re-reads their state.
    const linkResp = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode({
        account: accountId,
        // The helper dashboard route is /student-dashboard; it reads the
        // ?payout= param to surface a toast and re-check Connect state.
        refresh_url: `${origin}/student-dashboard?payout=refresh`,
        return_url: `${origin}/student-dashboard?payout=done`,
        type: 'account_onboarding',
      }),
    });

    if (!linkResp.ok) {
      const text = await linkResp.text();
      console.error('[household-helper-connect-link] link creation failed', linkResp.status, text);
      return bad(502, 'Could not generate onboarding link. Please try again.');
    }
    const link = await linkResp.json() as { url: string };

    return new Response(
      JSON.stringify({ url: link.url, account_id: accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[household-helper-connect-link] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
