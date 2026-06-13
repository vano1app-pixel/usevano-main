import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Fires once per booking when a job has been pending past the alert window
// (NO_HELPERS_ALERT_MINUTES, default 10 min) with no helper assigned. Reassures
// the customer and pings admin (WhatsApp + email via notify-admin-whatsapp) so
// they can manually sort it out or find a helper.
//
// Schedule: every few minutes in Supabase dashboard
//   Edge Functions → notify-household-no-helpers → Schedule → */5 * * * *

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring', other: 'General help',
};

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  // Bookings that are still pending after the alert window AND haven't had this
  // email yet. 10 min default keeps same-day jobs moving; override with
  // NO_HELPERS_ALERT_MINUTES.
  const alertMinutes = Number(Deno.env.get('NO_HELPERS_ALERT_MINUTES')) || 10;
  const alertCutoff  = new Date(Date.now() - alertMinutes * 60 * 1000).toISOString();

  const { data: bookings, error } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, city, price_estimate_cents, created_at')
    .eq('status', 'pending')
    .is('student_id', null)
    .is('no_helpers_email_sent_at', null)
    .lt('created_at', alertCutoff);

  if (error) {
    console.error('[no-helpers] query error', error);
    return new Response('DB error', { status: 500 });
  }

  let handled = 0;

  for (const b of (bookings ?? [])) {
    const catLabel  = CATEGORY_LABELS[b.category as string] ?? String(b.category);
    const custName  = String(b.customer_name || 'there');
    const ref       = String(b.id).slice(-8).toUpperCase();
    const trackUrl  = `${siteUrl}/track/${b.id}`;
    const waLink    = 'https://wa.me/353899817111';

    // ── Customer email ──────────────────────────────────────────────────────
    if (resendKey && b.customer_email) {
      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">We're still on it 🔍</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">
      We're still finding the right helper for your <strong>${catLabel}</strong> —
      it's taking a little longer than usual but we haven't forgotten you.
    </p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      If you need an update or want to talk to us directly, just tap below —
      we reply on WhatsApp straight away.
    </p>
    <a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;margin-bottom:12px;">Message us on WhatsApp →</a>
    <br>
    <a href="${trackUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;border:1px solid #e5e7eb;">Track booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · Your payment is safe — full refund if we can't find anyone.</p>
  </div>
</div>
</body></html>`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [b.customer_email as string],
          subject: `Still finding your helper — VANO`,
          html,
          text: `Hi ${custName}, we're still finding your helper for ${catLabel}. Takes a little longer today. Message us on WhatsApp: ${waLink}. Ref: ${ref}`,
        }),
      });
      if (!res.ok) console.warn('[no-helpers] Resend error', b.id, res.status);
    }

    // ── Admin alert — urgent ping so you can act manually ──────────────────
    // Routed through notify-admin-whatsapp: WhatsApp + guaranteed email fallback
    // + a tap-to-call link to the customer. Fire-and-forget so a Twilio/Resend
    // hiccup can never stop the cron from marking this booking handled.
    fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'no_helpers',
        stage: 'expired',
        customer_name: custName,
        customer_phone: b.customer_phone,
        customer_email: b.customer_email,
        category: b.category,
        city: b.city,
        scheduled_date: b.scheduled_date,
        price_euros: b.price_estimate_cents ? (b.price_estimate_cents / 100).toFixed(2) : undefined,
        booking_id: b.id,
      }),
    }).catch(() => {});

    // Mark sent so this never fires twice for the same booking
    await supabase
      .from('household_bookings')
      .update({ no_helpers_email_sent_at: new Date().toISOString() })
      .eq('id', b.id);

    handled++;
  }

  console.log(`[no-helpers] handled ${handled} / checked ${(bookings ?? []).length}`);
  return new Response(
    JSON.stringify({ ok: true, handled, checked: (bookings ?? []).length }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
