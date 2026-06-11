import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron: runs every 15 minutes.
// Pay-after-accept: a helper accepted but the customer hasn't paid the
// Stripe link yet. 30+ minutes after the payment was requested, send ONE
// reminder (SMS + email where available) and stamp payment_reminder_sent_at
// so we never nag twice. The admin already has the pay link from the
// "job claimed" email if a manual WhatsApp nudge is needed after this.

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', other: 'General help',
};

function normalizeIrishPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').trim();
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  if (cleaned.startsWith('00')) {
    const c = '+' + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(c) ? c : null;
  }
  if (/^08[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned.slice(1);
  if (/^8[3-9]\d{7}$/.test(cleaned)) return '+353' + cleaned;
  return null;
}

async function sendSms(to: string | null | undefined, body: string): Promise<boolean> {
  // Master SMS switch — OFF unless VANO_SMS_ENABLED='true'. Keep off until a
  // carrier-trusted sender is configured: an unregistered alphanumeric sender
  // ("VANO") is relabelled "Likely Scam" by Irish networks.
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  const from  = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!sid || !token || !from || from.startsWith('whatsapp:')) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
    });
    if (!resp.ok) console.warn('[remind-unpaid sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
    return resp.ok;
  } catch (e) {
    console.warn('[remind-unpaid sms] twilio exception', e);
    return false;
  }
}

serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey   = Deno.env.get('RESEND_API_KEY')?.trim();
  const from        = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const siteUrl     = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');

  const supabase = createClient(supabaseUrl, serviceKey);

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: unpaid, error: queryErr } = await supabase
    .from('household_bookings')
    .select('id, customer_name, customer_email, customer_phone, category, price_estimate_cents, booking_data, stripe_checkout_url, payment_requested_at')
    .in('status', ['accepted', 'on_way', 'arrived', 'in_progress'])
    .is('paid_at', null)
    .is('payment_reminder_sent_at', null)
    .not('stripe_checkout_url', 'is', null)
    .lt('payment_requested_at', cutoff);

  if (queryErr) {
    console.error('[remind-unpaid] query error', queryErr);
    return new Response('DB error', { status: 500 });
  }

  if (!unpaid || unpaid.length === 0) {
    return new Response(JSON.stringify({ reminded: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let reminded = 0;
  for (const row of unpaid) {
    const b = row as Record<string, unknown>;
    const bookingId = b.id as string;
    const ref = bookingId.slice(-8).toUpperCase();
    const catLabel = CATEGORY_LABELS[b.category as string] ?? 'booking';
    const payUrl = b.stripe_checkout_url as string;
    const priceCents = Number(b.price_estimate_cents) || 0;
    const feeCents = Number((b.booking_data as { service_fee_cents?: number } | null)?.service_fee_cents) || 0;
    const total = ((priceCents + feeCents) / 100).toFixed(2);
    const custName = String(b.customer_name ?? 'there');
    const trackUrl = `${siteUrl}/track/${bookingId}`;

    // Stamp BEFORE sending so a crash mid-loop can't double-text anyone.
    const { error: stampErr } = await supabase
      .from('household_bookings')
      .update({ payment_reminder_sent_at: new Date().toISOString() })
      .eq('id', bookingId)
      .is('payment_reminder_sent_at', null);
    if (stampErr) {
      console.error('[remind-unpaid] stamp failed', bookingId, stampErr);
      continue;
    }

    await sendSms(
      b.customer_phone as string | null,
      `VANO: Your helper is confirmed and holding your slot! Secure your ${catLabel} — pay €${total} here: ${payUrl}`,
    );

    const custEmail = b.customer_email as string | null;
    if (resendKey && custEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [custEmail],
          subject: `Your helper is waiting — confirm your ${catLabel} (€${total})`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your helper is holding your slot</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">Just a gentle nudge — your <strong>${catLabel}</strong> has a confirmed helper, but it isn't secured yet. One quick card payment locks it in. No cash needed on the day.</p>
    <a href="${payUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;">Confirm &amp; pay €${total} →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · Need help? WhatsApp <a href="https://wa.me/353899817111" style="color:#9ca3af;">+353 89 981 7111</a> · <a href="${trackUrl}" style="color:#9ca3af;">Track booking</a></p>
  </div>
</div>
</body></html>`,
          text: `Hi ${custName}, your ${catLabel} has a confirmed helper but isn't secured yet. Confirm & pay €${total} here: ${payUrl} — Ref: ${ref}`,
        }),
      }).catch(() => {});
    }

    reminded++;
  }

  console.log(`[remind-unpaid] reminded ${reminded} customer(s)`);
  return new Response(JSON.stringify({ reminded }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
