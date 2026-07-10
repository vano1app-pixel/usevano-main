import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Returns how many confirmed bookings this phone number has, and whether
// the next booking qualifies for the every-3rd-booking 50% loyalty reward.

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase     = createClient(supabaseUrl, serviceKey);

    const body  = await req.json().catch(() => ({}));
    const phone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : '';
    if (!phone) return bad(400, 'customer_phone is required');

    // Count PAID bookings for this phone. Under pay-after-accept every booking
    // is born status='pending' and unpaid, so counting by status alone let a
    // customer spin up 2 free throwaway 'pending' bookings and get 50% off the
    // 3rd. paid_at is the only reliable "this really happened" signal — this
    // mirrors the authoritative inline count in create-household-payment-checkout.
    const { count, error } = await supabase
      .from('household_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('customer_phone', phone)
      .not('paid_at', 'is', null)
      .neq('status', 'cancelled');

    if (error) {
      console.error('[check-loyalty]', error);
      return bad(500, 'Could not check loyalty status');
    }

    const confirmedCount  = count ?? 0;
    const nextBookingNum  = confirmedCount + 1;
    const isLoyalty       = nextBookingNum % 3 === 0;

    return new Response(
      JSON.stringify({
        confirmed_bookings: confirmedCount,
        next_booking_num:   nextBookingNum,
        is_loyalty:         isLoyalty,
        discount_pct:       isLoyalty ? 50 : 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[check-loyalty] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
