import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { allowRequest, clientIp } from "../_shared/rateLimit.ts";

// Allows anonymous customers to rate a completed booking (1–5 stars + optional comment).
// Enforced one-per-booking via unique constraint. Updates denormalized average on helper row.
//
// NOTE (owner decision needed): the anonymous-customer model has no secret that
// distinguishes the customer from the assigned helper — both hold the booking
// UUID — so a helper who knows their own completed booking ids can submit a
// 5-star rating for each (bounded to one per booking by the unique constraint),
// preempting the customer's honest rating. The rate-limit below blunts bulk
// scripting; the real fix is a per-booking rating token delivered only in the
// customer's completion email/SMS (arrival-code pattern) and required here.

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

    // Rate-limit per caller IP: a real customer rates one booking, so a low cap
    // costs them nothing but stops a helper scripting 5-star ratings across all
    // their completed jobs in a loop.
    if (!await allowRequest(supabase, 'rate-household-booking', clientIp(req), 8, 3600)) {
      return bad(429, 'Too many ratings — please wait a little and try again.');
    }

    const body = await req.json().catch(() => ({}));
    const { booking_id, rating, comment } = body;

    if (!booking_id) return bad(400, 'booking_id required');
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return bad(400, 'rating must be an integer 1–5');
    }

    const { data: booking, error: fetchErr } = await supabase
      .from('household_bookings')
      .select('id, status, student_id, customer_name, city')
      .eq('id', booking_id)
      .maybeSingle();

    if (fetchErr || !booking) return bad(404, 'Booking not found');
    if ((booking as Record<string, unknown>).status !== 'completed') {
      return bad(409, 'Can only rate completed bookings');
    }

    const studentId = (booking as Record<string, unknown>).student_id as string | null;

    // Reviewer attribution for the homepage review wall: first name only
    // (quick-book customers are 'Guest' — those stay anonymous) plus the
    // booking's area. Denormalized here so the anon-readable ratings table
    // never needs a join into bookings.
    const rawName = ((booking as Record<string, unknown>).customer_name as string | null)?.trim() ?? '';
    const reviewerName = rawName && rawName.toLowerCase() !== 'guest'
      ? rawName.split(/\s+/)[0].slice(0, 40)
      : null;
    const reviewerArea = ((booking as Record<string, unknown>).city as string | null)?.trim() || null;

    let helperId: string | null = null;
    let helperName: string | null = null;
    let helperEmail: string | null = null;
    if (studentId) {
      const { data: helperRow } = await supabase
        .from('household_helpers')
        .select('id, name, email')
        .eq('user_id', studentId)
        .maybeSingle() as { data: { id?: string; name?: string; email?: string | null } | null };
      helperId = helperRow?.id ?? null;
      helperName = helperRow?.name ?? null;
      helperEmail = helperRow?.email ?? null;
    }

    const { error: insertErr } = await supabase.from('household_ratings').insert({
      booking_id,
      helper_id: helperId,
      rating,
      comment: typeof comment === 'string' ? comment.trim().slice(0, 300) || null : null,
      reviewer_name: reviewerName,
      area: reviewerArea,
    });

    if (insertErr) {
      if (insertErr.code === '23505') return bad(409, 'This booking has already been rated');
      console.error('[rate-household-booking] insert error', insertErr);
      return bad(500, 'Could not save rating');
    }

    // Update denormalized average on the helper row
    let newAvg: number | null = null;
    let newCount = 0;
    if (helperId) {
      const { data: allRatings } = await supabase
        .from('household_ratings')
        .select('rating')
        .eq('helper_id', helperId);

      if (allRatings && allRatings.length > 0) {
        const avg = allRatings.reduce(
          (sum: number, r: { rating: number }) => sum + r.rating, 0,
        ) / allRatings.length;
        newAvg = Math.round(avg * 10) / 10;
        newCount = allRatings.length;
        await supabase.from('household_helpers').update({
          average_rating: newAvg,
          rating_count: newCount,
        }).eq('id', helperId);
      }
    }

    // Tell the helper they got rated — fire and forget. Customer stays
    // anonymous; we only pass on the stars and any written comment.
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    if (resendKey && helperEmail && helperName && helperId) {
      const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
      const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
      const helperFirst = helperName.split(' ')[0];
      const starsTxt = '★'.repeat(rating) + '☆'.repeat(5 - rating);
      const commentClean = typeof comment === 'string' ? comment.trim().slice(0, 300) : '';
      const profileUrl = `${siteUrl}/helpers/${helperId}`;
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${helperFirst},</p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">A customer just rated your recent job:</p>
    <p style="margin:0 0 16px;font-size:26px;color:#f5b301;letter-spacing:2px;">${starsTxt}</p>
    ${commentClean ? `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;font-style:italic;">"${commentClean.replace(/</g, '&lt;')}"</p>` : ''}
    ${newAvg ? `<p style="margin:0 0 20px;color:#6b7280;font-size:13px;">Your profile now shows &#9733; ${newAvg} from ${newCount} rating${newCount === 1 ? '' : 's'}.</p>` : ''}
    <a href="${profileUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;">See your profile &rarr;</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Great ratings get you matched to more jobs. Keep it up!</p>
  </div>
</div>
</body></html>`;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [helperEmail],
          subject: `You got ${rating === 5 ? '★★★★★' : `${rating} star${rating === 1 ? '' : 's'}`} on VANO`,
          html,
          text: `Hi ${helperFirst}, a customer just rated your recent job ${rating}/5${commentClean ? `: "${commentClean}"` : '.'} ${newAvg ? `Your profile now shows ${newAvg} from ${newCount} ratings. ` : ''}See it: ${profileUrl}`,
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[rate-household-booking] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
