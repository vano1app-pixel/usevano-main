import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Triggered by a Supabase Database Webhook on household_bookings when
// status changes to 'pending' (i.e. after Stripe payment completes).
//
// Flow:
//   1. Receive booking payload from webhook.
//   2. Find approved + available helpers in the same city.
//   3. Offer the job to up to MAX_OFFERS helpers (ordered by fewest accepted jobs).
//   4. Insert household_job_offers rows — helpers see these on their dashboard.
//   5. Send a WhatsApp nudge to each helper via Twilio (graceful degradation if
//      TWILIO_* env vars are not set — dispatch still works, notification skipped).
//
// When a helper accepts (via /student-job/:bookingId):
//   - Set household_bookings.student_id and status = 'accepted'
//   - Expire remaining offers for that booking (handled in the accept endpoint)

const MAX_OFFERS = 3;
const OFFER_TTL_MINUTES = 15;

// Normalise Irish mobile numbers to E.164 (+353…).
// Handles: 083…, +353 83…, 353083…, etc.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('353') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length >= 9) return `+353${digits.slice(1)}`;
  if (digits.length === 9 && /^[89]/.test(digits)) return `+353${digits}`;
  return `+${digits}`;
}

async function sendWhatsApp(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string,
): Promise<void> {
  const params = new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${to}`, Body: body });
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
    console.warn('[dispatch] Twilio error', resp.status, text.slice(0, 200));
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  other: 'General help',
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Twilio config — optional; skip notifications if not set
  const twilioSid    = Deno.env.get('TWILIO_ACCOUNT_SID');
  const twilioToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const twilioFrom   = Deno.env.get('TWILIO_WHATSAPP_NUMBER'); // e.g. +14155238886
  const notifyEnabled = Boolean(twilioSid && twilioToken && twilioFrom);

  const siteUrl = (Deno.env.get('SITE_URL') ?? 'https://vanojobs.com').replace(/\/$/, '');

  try {
    const payload = await req.json();

    // Supabase DB webhooks send { type, table, record, old_record }
    const booking = payload?.record ?? payload;
    const { id: bookingId, city, status, category, scheduled_date } = booking;

    if (status !== 'pending') {
      return new Response('Not a pending booking — skipping', { status: 200 });
    }
    if (!bookingId || !city) {
      return new Response('Missing booking id or city', { status: 400 });
    }

    // Idempotency: check no unexpired offers already exist
    const { count: existingOffers } = await supabase
      .from('household_job_offers')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .neq('status', 'expired');

    if (existingOffers && existingOffers > 0) {
      return new Response('Offers already sent', { status: 200 });
    }

    // Find available approved helpers in this city, fewest jobs first.
    // Also fetch name + phone for WhatsApp notifications.
    const { data: helpers, error: helpersError } = await supabase
      .from('household_helpers')
      .select('id, name, phone')
      .eq('city', city)
      .eq('status', 'approved')
      .eq('is_available', true)
      .order('accepted_count', { ascending: true })
      .limit(MAX_OFFERS);

    if (helpersError) {
      console.error('[dispatch] helpers query error', helpersError);
      return new Response('DB error', { status: 500 });
    }

    if (!helpers || helpers.length === 0) {
      console.warn(`[dispatch] no available helpers in ${city} for booking ${bookingId}`);
      return new Response('No helpers available', { status: 200 });
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000).toISOString();

    const offers = helpers.map((h: { id: string; name: string; phone: string }) => ({
      booking_id: bookingId,
      helper_id: h.id,
      expires_at: expiresAt,
      status: 'pending',
    }));

    const { error: insertError } = await supabase
      .from('household_job_offers')
      .insert(offers);

    if (insertError) {
      console.error('[dispatch] insert offers error', insertError);
      return new Response('Failed to insert offers', { status: 500 });
    }

    console.log(`[dispatch] offered booking ${bookingId} to ${offers.length} helper(s) in ${city}`);

    // Send WhatsApp notifications to each helper
    if (notifyEnabled) {
      const catLabel = CATEGORY_LABELS[category] ?? 'Household help';
      const when = scheduled_date ?? 'flexible';
      const dashboardUrl = `${siteUrl}/student-dashboard`;

      const notifyResults = await Promise.allSettled(
        (helpers as Array<{ id: string; name: string; phone: string }>).map((h) => {
          const firstName = h.name.split(' ')[0];
          const message =
            `Hi ${firstName}! New VANO job near you 🏠\n` +
            `Category: ${catLabel}\n` +
            `When: ${when}\n` +
            `City: ${city}\n\n` +
            `Tap to view & accept:\n${dashboardUrl}\n\n` +
            `(Offer expires in ${OFFER_TTL_MINUTES} min)`;

          const normalizedPhone = normalizePhone(h.phone);
          return sendWhatsApp(twilioSid!, twilioToken!, twilioFrom!, normalizedPhone, message);
        }),
      );

      const failed = notifyResults.filter((r) => r.status === 'rejected').length;
      if (failed > 0) console.warn(`[dispatch] ${failed}/${helpers.length} WhatsApp notification(s) failed`);
    } else {
      console.info('[dispatch] Twilio env vars not set — skipping WhatsApp notifications');
    }

    return new Response(
      JSON.stringify({ dispatched: offers.length, city, bookingId, notified: notifyEnabled }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dispatch] unhandled error', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
