import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  VANO_PAY_CURRENCY,
  VANO_PAY_FEE_BPS,
  VANO_PAY_MAX_CENTS,
  VANO_PAY_MIN_CENTS,
} from "../_shared/vanoPayConfig.ts";

// Exposes the Vano Pay fee + bounds to the frontend so the modal
// preview ("you pay / they receive / Vano keeps") stays in sync with
// the authoritative amount the create-vano-payment-checkout function
// charges. Values are public — no secrets. No auth needed; the client
// calls this before the user has even picked an amount.

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
      feeBps: VANO_PAY_FEE_BPS,
      minCents: VANO_PAY_MIN_CENTS,
      maxCents: VANO_PAY_MAX_CENTS,
      currency: VANO_PAY_CURRENCY,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
