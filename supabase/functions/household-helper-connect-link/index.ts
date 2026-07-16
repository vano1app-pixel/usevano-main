import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { phonesMatch } from "../_shared/phoneMatch.ts";
import { hasAccountAccess } from "../_shared/accountToken.ts";

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
// method, same idempotent reuse of an existing account id), with two
// deliberate differences: it reads/writes household_helpers keyed by
// user_id instead of student_profiles, and it requests the transfers
// capability ONLY (helpers are payout recipients, never card merchants)
// with the helper's name/email/phone prefilled — both of which keep
// Stripe's onboarding as short as possible.
//
// TWO auth paths (verify_jwt is now false in config.toml; both are
// enforced in the body):
//   1. JWT (dashboard payout card) — helper row keyed by user_id.
//   2. helper_id + phone (the phone-gated /student-account page) — the
//      same phone-as-auth stance as disconnect-helper-payouts /
//      delete-helper-account. The Stripe Express onboarding itself still
//      demands the onboarder's OWN identity + IBAN, but note the standing
//      CLAUDE.md item: the phone gate deserves an SMS OTP eventually.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// Stripe wants E.164. Application phones arrive as "089 123 4567",
// "+353 89...", "00353..." etc. Returns null when unsure — prefill is
// optional, a wrong guess is worse than an empty field.
function toE164Irish(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  let e164: string | null = null;
  if (raw.trim().startsWith('+')) e164 = `+${d}`;
  else if (d.startsWith('00')) e164 = `+${d.slice(2)}`;
  else if (d.startsWith('353')) e164 = `+${d}`;
  else if (d.startsWith('0')) e164 = `+353${d.slice(1)}`;
  return e164 && /^\+\d{9,15}$/.test(e164) ? e164 : null;
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
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, serviceKey);
    const reqBody = await req.json().catch(() => ({})) as {
      check_only?: boolean; helper_id?: string; phone?: string; account_token?: string;
    };

    // ── Resolve the caller to their helper row (two auth paths) ────────────

    interface HelperRow {
      id: string; user_id: string | null; stripe_account_id: string | null;
      stripe_payouts_enabled: boolean | null; name: string | null;
      phone: string | null; email: string | null;
    }
    let helper: HelperRow | null = null;
    let userId: string | null = null;
    let userEmail: string | undefined;

    if (reqBody.helper_id && reqBody.phone) {
      // Phone path — the /student-account page (no auth session). Since the
      // phone-gate hardening (July 2026) the page also presents the
      // account_token minted by student-account-otp: payout onboarding must
      // never start off a merely-guessed number.
      const { data } = await supabase
        .from('household_helpers')
        .select('id, user_id, stripe_account_id, stripe_payouts_enabled, name, phone, email')
        .eq('id', reqBody.helper_id)
        .maybeSingle();
      if (!data) return bad(404, 'No helper account found.');
      if (!phonesMatch(String(data.phone ?? ''), reqBody.phone)) {
        return bad(403, 'Phone number does not match.');
      }
      if (!await hasAccountAccess(reqBody.account_token, String(data.id))) {
        return bad(401, 'Your secure session expired — verify your number again on the account page.');
      }
      helper = data;
      userId = (data.user_id as string | null) ?? null;
    } else {
      // JWT path — the dashboard payout card (same getClaims pattern as
      // create-stripe-connect-link).
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return bad(401, 'Unauthorized');
      }
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return bad(401, 'Unauthorized');
      }
      userId = claimsData.claims.sub as string;
      userEmail = claimsData.claims.email as string | undefined;

      // The helper's Connect account lives on their household_helpers row.
      // name/phone/email are pulled so Express onboarding can be prefilled —
      // the helper should only have to type what we don't already know.
      const { data } = await supabase
        .from('household_helpers')
        .select('id, stripe_account_id, stripe_payouts_enabled, name, phone, email')
        .eq('user_id', userId)
        .maybeSingle();
      if (!data) {
        return bad(404, 'No helper account found for this user. Apply to join VANO first.');
      }
      helper = data;
    }

    // Status-sync mode: the payout card calls this with { check_only: true }
    // after the helper returns from onboarding to confirm readiness directly
    // with Stripe (so it shows "active" even if the account.updated webhook
    // isn't wired up). It never creates an account or onboarding link.
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
              await supabase.from('household_helpers').update({ stripe_payouts_enabled: true }).eq('id', helper.id);
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
        // transfers ONLY — helpers receive payouts, they never charge cards.
        // Requesting card_payments pulls in Stripe's fuller merchant KYC
        // (business profile etc.) and makes onboarding noticeably longer.
        'capabilities[transfers][requested]': 'true',
        business_type: 'individual',
        ...(userId ? { 'metadata[vano_user_id]': userId } : {}),
        'metadata[household_helper_id]': String(helper.id),
      };
      if (userEmail) accountParams.email = userEmail;
      else if (helper.email) accountParams.email = String(helper.email).trim().toLowerCase();

      // Prefill what the application already told us, so Express shows these
      // filled in and the helper mostly just adds DOB, address and IBAN.
      const prefill: Record<string, string> = {};
      const fullName = String(helper.name ?? '').trim();
      if (fullName) {
        const [first, ...rest] = fullName.split(/\s+/);
        prefill['individual[first_name]'] = first;
        if (rest.length > 0) prefill['individual[last_name]'] = rest.join(' ');
      }
      const email = accountParams.email;
      if (email) prefill['individual[email]'] = email;
      const e164 = toE164Irish(helper.phone as string | null);
      if (e164) prefill['individual[phone]'] = e164;

      const createAccount = (params: Record<string, string>) =>
        fetch('https://api.stripe.com/v1/accounts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formEncode(params),
        });

      // Prefill is best-effort: if Stripe rejects any prefilled value (odd
      // name characters, unparseable phone), retry bare rather than blocking
      // payout setup over a convenience.
      let resp = await createAccount({ ...accountParams, ...prefill });
      if (!resp.ok && Object.keys(prefill).length > 0) {
        const text = await resp.text().catch(() => '');
        console.warn('[household-helper-connect-link] prefilled creation rejected — retrying bare', resp.status, text.slice(0, 300));
        resp = await createAccount(accountParams);
      }

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
        .eq('id', helper.id);
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
        // Send the helper back to wherever they started: the phone path is
        // the /student-account page, the JWT path the dashboard. Both read
        // the ?payout= param to surface a toast and re-check Connect state.
        refresh_url: `${origin}${reqBody.phone ? '/student-account' : '/student-dashboard'}?payout=refresh`,
        return_url: `${origin}${reqBody.phone ? '/student-account' : '/student-dashboard'}?payout=done`,
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
