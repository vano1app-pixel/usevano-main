import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// RETIRED. The self-serve Family / Home Pass / Family Plus monthly plans this
// function used to open have been superseded by House Autopilot
// (create-autopilot-checkout), which prices every visit above minimum wage.
// The old plans advertised a "weekly 2-hour visit" at ~€9–11/hr — under the
// €14.15 floor — so this endpoint is intentionally closed: it opens no checkout.
//
// Existing legacy subscribers are unaffected — their Stripe subscriptions keep
// renewing and are handled by stripe-webhook exactly as before. This only stops
// NEW sign-ups to the retired plans. Safe to delete in the dashboard once the
// team has confirmed no client still points here.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  return new Response(
    JSON.stringify({
      error: 'This plan has moved to House Autopilot.',
      autopilot: 'https://vanojobs.com/#plans',
      whatsapp: 'https://wa.me/353899817111',
    }),
    { status: 410, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
});
