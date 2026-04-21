import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Returns the list of outstanding Stripe Connect requirements for the
// calling freelancer's account, mapped to human-readable labels. Used
// by the VanoPaySetupCard "pending" state so freelancers see exactly
// what's blocking them ("Link a bank account · Add your PPS number")
// instead of a vague "Stripe needs a bit more information."
//
// Stripe's requirements.currently_due is an array of dot-paths like
// ["external_account", "individual.id_number"] — unlabelled by default.
// Without translation, clicking "Finish setup" dumps the freelancer
// back into the Stripe-hosted flow with no preview of what's there.
// With translation, they know whether it's a 30-second missing field
// or a real ID-doc upload before they tap.
//
// Returns { requirements: Array<{ key, label }>, disabled_reason: string|null }.
// Empty array + null disabled_reason means the account is payout-ready;
// the webhook should have already flipped stripe_payouts_enabled to
// true in that case, so the card's pending state shouldn't be showing
// — but we handle it gracefully as a success.

const REQUIREMENT_LABELS: Record<string, string> = {
  // Bank account / external payouts
  'external_account': 'Link a bank account for payouts',
  'external_accounts': 'Link a bank account for payouts',

  // Identity — personal
  'individual.first_name': 'Add your first name',
  'individual.last_name': 'Add your last name',
  'individual.dob.day': 'Add your date of birth',
  'individual.dob.month': 'Add your date of birth',
  'individual.dob.year': 'Add your date of birth',
  'individual.email': 'Confirm your email address',
  'individual.phone': 'Add your phone number',
  'individual.id_number': 'Add your PPS / tax ID number',
  'individual.ssn_last_4': 'Add the last 4 digits of your tax ID',

  // Identity — address
  'individual.address.line1': 'Add your home address',
  'individual.address.city': 'Add your city',
  'individual.address.postal_code': 'Add your postal code / Eircode',
  'individual.address.state': 'Add your county',
  'individual.address.country': 'Confirm your country',

  // Identity — document upload
  'individual.verification.document': 'Upload a photo of your ID (passport or driving licence)',
  'individual.verification.additional_document': 'Upload a second proof-of-identity document',

  // Business profile
  'business_profile.url': 'Add a website, portfolio, or social URL',
  'business_profile.product_description': 'Add a short description of what you do',
  'business_profile.mcc': 'Confirm the kind of work you do',
  'business_profile.support_phone': 'Add a support phone number',

  // Terms of service
  'tos_acceptance.date': 'Accept Stripe’s terms of service',
  'tos_acceptance.ip': 'Accept Stripe’s terms of service',
  'tos_acceptance.user_agent': 'Accept Stripe’s terms of service',
};

/** Collapse a requirements list into unique friendly labels, preserving order. */
function friendlyRequirements(raw: string[]): Array<{ key: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ key: string; label: string }> = [];
  for (const key of raw) {
    const label = REQUIREMENT_LABELS[key] ?? `Stripe needs: ${key.replace(/[._]/g, ' ')}`;
    // De-dupe on label so repeated dob.day/month/year → one "Add your date of birth".
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ key, label });
  }
  return out;
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
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    if (!STRIPE_SECRET_KEY) return bad(500, 'STRIPE_SECRET_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return bad(401, 'Unauthorized');
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: sp } = await supabase
      .from('student_profiles')
      .select('stripe_account_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!sp?.stripe_account_id) {
      // No Stripe account yet — nothing to report. Client should be in
      // the "not_set_up" branch anyway.
      return new Response(
        JSON.stringify({ requirements: [], disabled_reason: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const stripeResp = await fetch(
      `https://api.stripe.com/v1/accounts/${encodeURIComponent(sp.stripe_account_id)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
      },
    );

    if (!stripeResp.ok) {
      const text = await stripeResp.text().catch(() => '');
      console.error('[get-vano-pay-requirements] stripe fetch failed', stripeResp.status, text.slice(0, 300));
      // Don't fail the card on a Stripe hiccup — return empty so the
      // existing "pending" generic copy still renders.
      return new Response(
        JSON.stringify({ requirements: [], disabled_reason: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const account = await stripeResp.json() as {
      requirements?: {
        currently_due?: string[];
        past_due?: string[];
        disabled_reason?: string | null;
      };
    };

    // currently_due = blocks payouts right now · past_due = overdue and
    // already blocking. We treat them as one list for display; past_due
    // entries are typically also in currently_due so the Set de-dupes.
    const merged = new Set([
      ...(account.requirements?.currently_due ?? []),
      ...(account.requirements?.past_due ?? []),
    ]);
    const requirements = friendlyRequirements(Array.from(merged));

    return new Response(
      JSON.stringify({
        requirements,
        disabled_reason: account.requirements?.disabled_reason ?? null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[get-vano-pay-requirements] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
