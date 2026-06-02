import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Sends a WhatsApp message to the VANO admin number via Twilio.
// Called by:
//   - JoinAsHelper (frontend) when a new student signs up
//   - stripe-webhook when a household booking is paid
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID   — from console.twilio.com
//   TWILIO_AUTH_TOKEN    — from console.twilio.com
//   TWILIO_WA_FROM       — your Twilio WhatsApp sender, e.g. +14155238886
//   ADMIN_WA_NUMBER      — your number in E.164, e.g. +353899817111

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendWhatsApp(to: string, body: string): Promise<void> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from       = Deno.env.get('TWILIO_WA_FROM');

  if (!accountSid || !authToken || !from) {
    console.warn('[notify-admin-whatsapp] Twilio creds not set — skipping');
    return;
  }

  const params = new URLSearchParams({
    From: `whatsapp:${from}`,
    To:   `whatsapp:${to}`,
    Body: body,
  });

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
    const text = await resp.text();
    console.warn('[notify-admin-whatsapp] Twilio error', resp.status, text.slice(0, 300));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const adminNumber = Deno.env.get('ADMIN_WA_NUMBER') || '+353899817111';

  try {
    const body = await req.json();
    const { type } = body;

    if (type === 'new_student') {
      const { name, phone, email, city, categories, tutor_subjects, tutor_levels, photo_url } = body;
      const cats = Array.isArray(categories) ? categories.join(', ') : categories;
      const tutorLine = tutor_subjects?.length
        ? `\nSubjects: ${tutor_subjects.join(', ')} | Levels: ${(tutor_levels ?? []).join(', ')}`
        : '';

      const message =
        `🎓 *New student signup!*\n` +
        `Name: ${name}\n` +
        `Phone: ${phone}\n` +
        `Email: ${email}\n` +
        `City: ${city}\n` +
        `Jobs: ${cats}${tutorLine}\n` +
        `Photo: ${photo_url}`;

      await sendWhatsApp(adminNumber, message);

    } else if (type === 'new_booking') {
      const { customer_name, customer_phone, customer_email, category, scheduled_date, city, price_euros, booking_id } = body;

      const categoryLabels: Record<string, string> = {
        shopping: 'Shopping run', 'dog-walk': 'Dog walk', garden: 'Garden help',
        moving: 'Moving help', cleaning: 'Cleaning', other: 'General help',
      };
      const cat = categoryLabels[category] ?? category;

      const message =
        `💰 *New paid booking!*\n` +
        `Job: ${cat}\n` +
        `Customer: ${customer_name}\n` +
        `Phone: ${customer_phone ?? 'not provided'}\n` +
        `Email: ${customer_email ?? 'not provided'}\n` +
        `City: ${city}\n` +
        `When: ${scheduled_date ?? 'flexible'}\n` +
        `Paid: €${price_euros}\n` +
        `Ref: ${String(booking_id).slice(-8).toUpperCase()}`;

      await sendWhatsApp(adminNumber, message);

    } else {
      return new Response(JSON.stringify({ error: 'unknown type' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[notify-admin-whatsapp] error', err);
    return new Response('error', { status: 500, headers: CORS });
  }
});
