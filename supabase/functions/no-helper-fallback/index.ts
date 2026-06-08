import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron: runs every 30 minutes.
// Finds bookings that have been in 'pending' status for more than 2 hours
// with no helper assigned, issues a full Stripe refund, flips them to
// 'cancelled', and emails both the customer and admin.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (_req) => {
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY');
  const resendKey     = Deno.env.get('RESEND_API_KEY')?.trim();
  const from          = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const adminEmail    = Deno.env.get('ADMIN_EMAIL')?.trim();
  const siteUrl       = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: stuckBookings, error: queryErr } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, category, city, price_estimate_cents, stripe_payment_intent_id')
    .eq('status', 'pending')
    .is('student_id', null)
    .lt('created_at', cutoff);

  if (queryErr) {
    console.error('[no-helper-fallback] query error', queryErr);
    return new Response('DB error', { status: 500 });
  }

  if (!stuckBookings || stuckBookings.length === 0) {
    console.log('[no-helper-fallback] nothing to process');
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`[no-helper-fallback] processing ${stuckBookings.length} stuck booking(s)`);
  let processed = 0;

  for (const booking of stuckBookings) {
    const b         = booking as Record<string, unknown>;
    const ref       = (b.id as string).slice(-8).toUpperCase();
    const custName  = String(b.customer_name ?? 'there');
    const custEmail = b.customer_email as string | null;
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? 'job';

    // Stripe refund
    let refundOk = false;
    const piId = b.stripe_payment_intent_id as string | null;
    if (STRIPE_SECRET && piId?.startsWith('pi_')) {
      try {
        const refundResp = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formEncode({ payment_intent: piId }),
        });
        refundOk = refundResp.ok;
        if (!refundOk) {
          const txt = await refundResp.text();
          console.error(`[no-helper-fallback] stripe refund error for ${b.id}`, refundResp.status, txt.slice(0, 200));
        }
      } catch (e) {
        console.error(`[no-helper-fallback] refund exception for ${b.id}`, e);
      }
    }

    await supabase.from('household_bookings').update({ status: 'cancelled' }).eq('id', b.id);
    await supabase.from('household_job_updates').insert({
      booking_id: b.id,
      status: 'cancelled',
      note: 'No helper available — auto-cancelled after 2 hours.',
    });

    if (resendKey && custEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [custEmail],
          subject: `Sorry — we couldn't find a helper for your ${catLabel}`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#374151;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">We couldn't find a helper</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We're really sorry — we weren't able to find an available helper for your <strong>${catLabel}</strong> in time. Your booking has been cancelled.</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${refundOk ? '<strong>A full refund has been issued</strong> and should appear on your card within 5–7 business days.' : 'Please contact us and we will arrange your refund immediately.'}</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;">Want to try again? <a href="${siteUrl}" style="color:#4a7c59;font-weight:600;">Book here</a></p>
    <p style="margin:0;color:#374151;font-size:15px;">Or message us on WhatsApp: <a href="https://wa.me/353899817111" style="color:#4a7c59">+353 89 981 7111</a></p>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref}</p>
  </div>
</div>
</body></html>`,
          text: `Hi ${custName}, we're really sorry — no helper was available for your ${catLabel}. ${refundOk ? 'Full refund issued (5–7 days).' : 'Contact us about refund.'} Book again at ${siteUrl} or WhatsApp +353 89 981 7111. Ref: ${ref}`,
        }),
      }).catch(() => {});
    }

    if (resendKey && adminEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [adminEmail],
          subject: `⚠️ No helper found — auto-cancelled ${ref}`,
          text: [
            `Booking ${ref} was auto-cancelled (2h, no helper).`,
            `Job: ${catLabel}`,
            `Customer: ${custName} (${custEmail ?? '—'})`,
            `City: ${b.city ?? '?'}`,
            `Refund: ${refundOk ? 'Issued' : 'FAILED — check manually'}`,
            `ID: ${b.id}`,
          ].join('\n'),
        }),
      }).catch(() => {});
    }

    processed++;
  }

  console.log(`[no-helper-fallback] processed ${processed} booking(s)`);
  return new Response(JSON.stringify({ processed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
