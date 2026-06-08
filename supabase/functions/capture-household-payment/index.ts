import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

// Marks a household job as complete, records the student payout, and fires
// post-completion notifications.
//
// Payment was already captured by Stripe automatically at checkout — this
// function does NOT call Stripe; it just closes out the booking and creates
// the payout ledger row so admin knows how much to pay the student.
//
// Guards:
//   - Caller must be the assigned student
//   - Booking must be in an active status (accepted / on_way / arrived / in_progress)

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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return bad(401, 'Unauthorized');
    const callerId = user.id;

    const body = await req.json().catch(() => ({}));
    const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : null;
    if (!bookingId) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch the booking
    const { data: booking, error: fetchError } = await supabase
      .from('household_bookings')
      .select('id, student_id, customer_id, status, stripe_payment_intent_id, price_estimate_cents, customer_name, customer_email, category, city')
      .eq('id', bookingId)
      .maybeSingle();

    if (fetchError || !booking) return bad(404, 'Booking not found');

    // Must be the assigned student
    if (booking.student_id !== callerId) return bad(403, 'Not the assigned student');

    // Must be in a capturable state
    if (!['accepted', 'on_way', 'arrived', 'in_progress'].includes(booking.status)) {
      return bad(409, `Cannot capture payment in status: ${booking.status}`);
    }

    // Payment was already captured automatically at Stripe checkout — nothing to do with Stripe here.

    // Mark booking completed
    const { error: updateError } = await supabase
      .from('household_bookings')
      .update({ status: 'completed' })
      .eq('id', bookingId)
      .eq('student_id', callerId);

    if (updateError) {
      console.error('[capture-household-payment] booking update failed', updateError);
      return bad(500, 'Payment captured but booking status update failed. Contact support.');
    }

    // Create the payout row (pending — admin pays student manually via Revolut)
    const PLATFORM_FEE_BPS = 1500; // 15% platform fee
    const priceCents = booking.price_estimate_cents ?? 0;
    const studentCents = Math.floor(priceCents * (10000 - PLATFORM_FEE_BPS) / 10000);

    await supabase.from('household_payouts').insert({
      booking_id: bookingId,
      student_id: callerId,
      amount_cents: studentCents,
      status: 'pending',
    });

    // Insert a completed job update
    await supabase.from('household_job_updates').insert({
      booking_id: bookingId,
      status: 'completed',
      note: 'Job completed and payment captured.',
    });

    // ── Post-completion notifications — fire and forget ───────────────────
    const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
    const from = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const categoryLabels: Record<string, string> = {
      shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
      moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
    };
    const catLabel = categoryLabels[(booking as Record<string, unknown>).category as string] ?? 'job';
    const custName = String((booking as Record<string, unknown>).customer_name ?? 'there');
    const custEmail = (booking as Record<string, unknown>).customer_email as string | null;
    const ref = bookingId.slice(-8).toUpperCase();
    const trackUrl = `${siteUrl}/track/${bookingId}`;

    // Helper name for the email
    let helperFirst = 'Your helper';
    const { data: helperRow } = await supabase
      .from('household_helpers')
      .select('name')
      .eq('user_id', callerId)
      .maybeSingle() as { data: { name?: string } | null };
    if (helperRow?.name) helperFirst = helperRow.name.split(' ')[0];

    // Customer completion email
    if (resendKey && custEmail) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">All done! ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirst}</strong> has completed your <strong>${catLabel}</strong>.
      Payment has been processed — all done!
    </p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      If you have any questions or need anything else, text us on WhatsApp:
      <a href="https://wa.me/353899817111" style="color:#4a7c59;">+353 89 981 7111</a>
    </p>
    <a href="${trackUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;border:1px solid #e5e7eb;">View booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Thanks for using VANO · Ref: ${ref}</p>
  </div>
</div>
</body></html>`;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [custEmail],
          subject: `Your ${catLabel} is complete — VANO`,
          html,
          text: `Hi ${custName}, ${helperFirst} has completed your ${catLabel}. Payment processed. Any questions? WhatsApp +353 89 981 7111. Ref: ${ref}`,
        }),
      }).catch(() => {});
    }

    // Admin job-done email
    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
    if (resendKey && adminEmail) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [adminEmail],
          subject: `✅ Job done — ${helperFirst} completed ${catLabel}`,
          text: [
            `${helperFirst} just completed a job.`,
            `Job: ${catLabel}`,
            `Customer: ${custName}`,
            `Paid: €${(priceCents / 100).toFixed(2)} (student earns €${(studentCents / 100).toFixed(2)})`,
            `Ref: ${ref}`,
            `Track: ${trackUrl}`,
          ].join('\n'),
        }),
      }).catch(() => {});
    }

    // Admin WhatsApp ping
    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'job_complete',
        helper_name: helperFirst,
        customer_name: custName,
        category: (booking as Record<string, unknown>).category,
        city: (booking as Record<string, unknown>).city,
        price_euros: (((booking as Record<string, unknown>).price_estimate_cents as number ?? 0) / 100).toFixed(2),
        student_earns_euros: (studentCents / 100).toFixed(2),
        booking_id: bookingId,
      }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, student_earns_cents: studentCents }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[capture-household-payment] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
