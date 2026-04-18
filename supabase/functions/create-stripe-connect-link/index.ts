import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Creates (or retrieves) a Stripe Connect Express account for the
// calling freelancer and returns a hosted onboarding URL. The
// freelancer links their bank + identity with Stripe directly (we
// never see those details); on return, stripe-webhook listens for
// account.updated events and flips stripe_payouts_enabled once
// Stripe confirms the account is payout-ready.
//
// Idempotent: a second call for the same user reuses the existing
// account id (we never create duplicates) and just mints a fresh
// onboarding link — useful when the user bails halfway through and
// comes back.

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

    // Verify caller.
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

    // Only freelancers can enable Vano Pay — business accounts have no
    // need to receive payouts.
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', userId)
      .maybeSingle();
    if (profile?.user_type !== 'student') {
      return bad(403, 'Only freelancer accounts can enable Vano Pay');
    }

    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('stripe_account_id, stripe_payouts_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';

    // Create a Connect Express account if one doesn't exist yet.
    let accountId = studentProfile?.stripe_account_id ?? null;
    if (!accountId) {
      const accountParams: Record<string, string> = {
        type: 'express',
        // Ireland-default country. Stripe restricts Express to certain
        // countries; we serve Ireland primarily. If a freelancer is
        // abroad they can update country during onboarding.
        country: 'IE',
        'capabilities[transfers][requested]': 'true',
        'capabilities[card_payments][requested]': 'true',
        business_type: 'individual',
        'metadata[vano_user_id]': userId,
      };
      if (userEmail) accountParams.email = userEmail;

      const resp = await fetch('https://api.stripe.com/v1/accounts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          // Stripe Connect is an account-level feature; the request
          // will 400 with "Connect is not enabled" if the platform
          // hasn't flipped the toggle in Stripe Dashboard → Connect
          // → Get started. Surface that error clearly.
        },
        body: formEncode(accountParams),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error('[create-stripe-connect-link] account creation failed', resp.status, text);
        return bad(
          502,
          text.includes('signed up for Connect')
            ? 'Stripe Connect is not enabled on this platform yet. Owner: enable it in Stripe Dashboard → Connect.'
            : 'Could not start Vano Pay setup. Please try again.',
        );
      }
      const account = await resp.json() as { id: string };
      accountId = account.id;

      await supabase
        .from('student_profiles')
        .update({ stripe_account_id: accountId })
        .eq('user_id', userId);
    }

    // Mint a one-time onboarding link. These expire after ~5 minutes
    // of inactivity, so we never persist them — just generate fresh
    // on each call.
    const linkResp = await fetch('https://api.stripe.com/v1/account_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formEncode({
        account: accountId,
        refresh_url: `${origin}/profile?vano_pay_refresh=1`,
        return_url: `${origin}/profile?vano_pay_done=1`,
        type: 'account_onboarding',
      }),
    });

    if (!linkResp.ok) {
      const text = await linkResp.text();
      console.error('[create-stripe-connect-link] link creation failed', linkResp.status, text);
      return bad(502, 'Could not generate onboarding link. Please try again.');
    }
    const link = await linkResp.json() as { url: string };

    return new Response(
      JSON.stringify({ url: link.url, account_id: accountId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-stripe-connect-link] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
