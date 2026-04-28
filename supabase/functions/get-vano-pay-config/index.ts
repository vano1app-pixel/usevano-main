import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  VANO_PAY_CURRENCY,
  VANO_PAY_FREELANCER_FEE_BPS,
  VANO_PAY_HIRER_FEE_BPS,
  VANO_PAY_MAX_CENTS,
  VANO_PAY_MIN_CENTS,
  VANO_PAY_TOTAL_FEE_BPS_OF_AGREED,
} from "../_shared/vanoPayConfig.ts";

// Exposes the Vano Pay fee + bounds to the frontend so the modal
// preview ("you pay / they receive / Vano keeps") stays in sync with
// the authoritative amount the create-vano-payment-checkout function
// charges. Values are public — no secrets. No auth needed; the client
// calls this before the user has even picked an amount.
//
// Fee model: SPLIT 4% / 4% on the agreed price (hirer adds 4% on top,
// freelancer has 4% deducted). `feeBps` is the legacy field — we
// continue to send it as the TOTAL bps of the agreed price (= 800)
// purely so any stale client during a deploy window has a reasonable
// approximation. New clients should use `hirerFeeBps` +
// `freelancerFeeBps` and stop relying on `feeBps`.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  // Cache at the edge — changing the fee means redeploying this
  // function, which invalidates the cached response on next hit.
  'Cache-Control': 'public, max-age=300, s-maxage=3600',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      hirerFeeBps: VANO_PAY_HIRER_FEE_BPS,
      freelancerFeeBps: VANO_PAY_FREELANCER_FEE_BPS,
      totalFeeBpsOfAgreed: VANO_PAY_TOTAL_FEE_BPS_OF_AGREED,
      // Legacy field — same numeric value as totalFeeBpsOfAgreed for
      // compatibility with old clients. Not used by the new modal.
      feeBps: VANO_PAY_TOTAL_FEE_BPS_OF_AGREED,
      minCents: VANO_PAY_MIN_CENTS,
      maxCents: VANO_PAY_MAX_CENTS,
      currency: VANO_PAY_CURRENCY,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
