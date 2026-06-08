import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Allows anonymous customers to rate a completed booking (1–5 stars + optional comment).
// Enforced one-per-booking via unique constraint. Updates denormalized average on helper row.

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { booking_id, rating, comment } = body;

    if (!booking_id) return bad(400, 'booking_id required');
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return bad(400, 'rating must be an integer 1–5');
    }

    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, status, student_id')
      .eq('id', booking_id)
      .maybeSingle();

    if (fetchErr || !booking) return bad(404, 'Booking not found');
    if ((booking as Record<string, unknown>).status !== 'completed') {
      return bad(409, 'Can only rate completed bookings');
    }

    const studentId = (booking as Record<string, unknown>).student_id as string | null;

    let helperId: string | null = null;
    if (studentId) {
      const { data: helperRow } = await supabase
        .from('household_helpers')
        .select('id')
        .eq('user_id', studentId)
        .maybeSingle() as { data: { id?: string } | null };
      helperId = helperRow?.id ?? null;
    }

    const { error: insertErr } = await supabase.from('household_ratings').insert({
      booking_id,
      helper_id: helperId,
      rating,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 300) || null : null,
    });

    if (insertErr) {
      if (insertErr.code === '23505') return bad(409, 'This booking has already been rated');
      console.error('[rate-household-booking] insert error', insertErr);
      return bad(500, 'Could not save rating');
    }

    // Update denormalized average on the helper row
    if (helperId) {
      const { data: allRatings } = await supabase
        .from('household_ratings')
        .select('rating')
        .eq('helper_id', helperId);

      if (allRatings && allRatings.length > 0) {
        const avg = allRatings.reduce(
          (sum: number, r: { rating: number }) => sum + r.rating, 0,
        ) / allRatings.length;
        await supabase.from('household_helpers').update({
          average_rating: Math.round(avg * 10) / 10,
          rating_count: allRatings.length,
        }).eq('id', helperId);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[rate-household-booking] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
