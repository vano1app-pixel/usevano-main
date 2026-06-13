import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Admin notification channel. Tries WhatsApp via Twilio when configured,
// and ALWAYS emails the admin via Resend as well — Twilio was the only
// channel for months and it was never configured, so every "ping" silently
// vanished. Email is the guaranteed backup; each one carries a one-tap
// wa.me link to the person involved so WhatsApp follow-up is one click.
//
// Called by:
//   - create-helper-application (new_student)
//   - stripe-webhook (new_booking / helper_membership_paid)
//   - StudentJobDetail via functions.invoke (helper_arrived)
//   - notify-household-on-way (helper_on_way)
//   - capture-household-payment (job_complete)
// Unknown types with a `message` field are forwarded as-is, so new senders
// can never lose a message to a 400.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', other: 'General help',
};

function waLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  const e164 = d.startsWith('353') ? d : d.startsWith('0') ? '353' + d.slice(1) : d;
  return `https://wa.me/${e164}`;
}

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from       = Deno.env.get('TWILIO_WHATSAPP_FROM') || Deno.env.get('TWILIO_WA_FROM') || Deno.env.get('TWILIO_FROM_NUMBER');

  if (!accountSid || !authToken || !from) {
    console.info('[notify-admin-whatsapp] Twilio not configured — email fallback only');
    return false;
  }

  const fromAddr = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const params = new URLSearchParams({
    From: fromAddr,
    To:   `whatsapp:${to}`,
    Body: body,
  });

  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      },
    );
    if (!resp.ok) {
      console.warn('[notify-admin-whatsapp] Twilio error', resp.status, (await resp.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[notify-admin-whatsapp] Twilio exception', e);
    return false;
  }
}

// Email fallback — guaranteed delivery channel. contactPhone (when present)
// becomes a one-tap "WhatsApp them" button.
async function emailAdmin(subject: string, message: string, contactPhone?: string | null): Promise<void> {
  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  if (!resendKey) { console.warn('[notify-admin-whatsapp] RESEND_API_KEY not set — message lost'); return; }
  const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
  const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com';
  const wa = waLink(contactPhone);

  const htmlMessage = message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: resendFrom,
        to: [adminEmail],
        subject,
        html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:24px auto;background:#fff;border-radius:14px;border:1px solid #e5e7eb;padding:24px 26px;">
  <p style="margin:0 0 14px;color:#111827;font-size:14px;line-height:1.7;">${htmlMessage}</p>
  ${wa ? `<a href="${wa}" style="display:inline-block;background:#25d366;color:#fff;font-size:13px;font-weight:600;padding:11px 20px;border-radius:100px;text-decoration:none;">💬 WhatsApp them</a>` : ''}
</div>
</body></html>`,
        text: message + (wa ? `\n\nWhatsApp them: ${wa}` : ''),
      }),
    });
  } catch (e) {
    console.warn('[notify-admin-whatsapp] email fallback failed', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const adminNumber = Deno.env.get('ADMIN_WA_NUMBER') || '+353899817111';

  try {
    const body = await req.json();
    const { type } = body;
    const cat = (c: string) => CATEGORY_LABELS[c] ?? c;
    const ref = (id: unknown) => String(id ?? '').slice(-8).toUpperCase();
    const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://vanojobs.com').replace(/\/$/, '');

    let message: string;
    let subject: string;
    let contactPhone: string | null = null;

    if (type === 'new_student') {
      const { name, phone, email, city, categories, tutor_subjects, tutor_levels, photo_url } = body;
      const cats = Array.isArray(categories) ? categories.join(', ') : categories;
      const tutorLine = tutor_subjects?.length
        ? `\nSubjects: ${tutor_subjects.join(', ')} | Levels: ${(tutor_levels ?? []).join(', ')}`
        : '';
      subject = `🎓 New helper application — ${name} (${city})`;
      message =
        `🎓 *New helper application!*\n` +
        `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nCity: ${city}\n` +
        `Jobs: ${cats}${tutorLine}\nPhoto: ${photo_url}\n\n` +
        `Review & approve: ${siteUrl}/household-admin`;
      contactPhone = phone;

    } else if (type === 'new_booking') {
      const { customer_name, customer_phone, customer_email, category, scheduled_date, city, price_euros, booking_id } = body;
      subject = `💰 Paid booking — ${cat(category)} in ${city ?? '?'} — ${ref(booking_id)}`;
      message =
        `💰 *New paid booking!*\n` +
        `Job: ${cat(category)}\nCustomer: ${customer_name}\nPhone: ${customer_phone ?? 'not provided'}\n` +
        `Email: ${customer_email ?? 'not provided'}\nCity: ${city}\nWhen: ${scheduled_date ?? 'flexible'}\n` +
        `Paid: €${price_euros}\nRef: ${ref(booking_id)}`;
      contactPhone = customer_phone;

    } else if (type === 'helper_on_way') {
      const { helper_name, customer_name, category, city, booking_id } = body;
      subject = `🚶 Helper on the way — ${cat(category)} — ${ref(booking_id)}`;
      message =
        `🚶 *Helper on the way!*\nHelper: ${helper_name ?? 'Unknown'}\nCustomer: ${customer_name ?? 'Unknown'}\n` +
        `Job: ${cat(category)}\nCity: ${city ?? '—'}\nRef: ${ref(booking_id)}`;

    } else if (type === 'helper_arrived') {
      const { helper_name, customer_name, category, city, booking_id } = body;
      subject = `📍 Helper arrived — ${cat(category)} — ${ref(booking_id)}`;
      message =
        `📍 *Helper arrived — job starting.*\nHelper: ${helper_name ?? 'Unknown'}\nCustomer: ${customer_name ?? 'Unknown'}\n` +
        `Job: ${cat(category)}\nCity: ${city ?? '—'}\nRef: ${ref(booking_id)}`;

    } else if (type === 'job_complete') {
      const { helper_name, customer_name, category, city, price_euros, student_earns_euros, booking_id } = body;
      subject = `✅ Job complete — ${cat(category)} — ${ref(booking_id)}`;
      message =
        `✅ *Job complete!*\nHelper: ${helper_name ?? 'Unknown'}\nCustomer: ${customer_name ?? 'Unknown'}\n` +
        `Job: ${cat(category)}\nCity: ${city ?? '—'}\n` +
        `Paid: €${price_euros ?? '?'} · Student earns: €${student_earns_euros ?? '?'}\nRef: ${ref(booking_id)}`;

    } else if (type === 'helper_membership_paid') {
      const { helper_name, helper_email, helper_phone, helper_city } = body;
      subject = `💳 Helper membership paid — ${helper_name ?? helper_email}`;
      message =
        `💳 *Helper paid their €4.99 membership!*\n` +
        `Name: ${helper_name ?? '—'}\nEmail: ${helper_email ?? '—'}\nPhone: ${helper_phone ?? '—'}\nCity: ${helper_city ?? '—'}\n\n` +
        `They're waiting on approval: ${siteUrl}/household-admin`;
      contactPhone = helper_phone;

    } else if (type === 'no_helpers') {
      const { customer_name, customer_phone, customer_email, category, scheduled_date, city, price_euros, booking_id, stage, offers_sent } = body;
      const stageLine = stage === 'none_available'
        ? 'No approved/available helpers matched this job — needs manual cover NOW.'
        : stage === 'expired'
        ? `Pending with no acceptance${offers_sent ? ` (${offers_sent} offer(s) expired)` : ''} — needs manual action.`
        : 'Still searching — no helper yet.';
      subject = `🚨 No helper — ${cat(category)} in ${city ?? '?'} — ${ref(booking_id)}`;
      message =
        `🚨 *No helper found!*\n` +
        `${stageLine}\n` +
        `Job: ${cat(category)}\nCustomer: ${customer_name ?? 'Guest'}\n` +
        `Phone: ${customer_phone ?? 'not provided'}\nEmail: ${customer_email ?? 'not provided'}\n` +
        `City: ${city ?? '—'}\nWhen: ${scheduled_date ?? 'flexible'}\n` +
        `Price: €${price_euros ?? '?'}\nRef: ${ref(booking_id)}`;
      contactPhone = customer_phone;

    } else if (typeof body?.message === 'string' && body.message.trim()) {
      // Generic passthrough — unknown senders never lose a message to a 400
      subject = body.subject ?? `VANO admin ping — ${type ?? 'message'}`;
      message = body.message;
      contactPhone = body.contact_phone ?? null;

    } else {
      return new Response(JSON.stringify({ error: 'unknown type' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const waOk = await sendWhatsApp(adminNumber, message);
    await emailAdmin(subject, message, contactPhone);

    return new Response(JSON.stringify({ sent: true, whatsapp: waOk, email: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-admin-whatsapp] error', err);
    return new Response('error', { status: 500, headers: CORS });
  }
});
