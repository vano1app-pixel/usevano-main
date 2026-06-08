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
//   5. Email each matched helper via Resend about the new job.
//
// When a helper accepts (via /student-job/:bookingId):
//   - Set household_bookings.student_id and status = 'accepted'
//   - Expire remaining offers for that booking (handled in the accept endpoint)

const MAX_OFFERS = 3;
const OFFER_TTL_MINUTES = 15;

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

  const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';

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
      .select('id, name, phone, email')
      .eq('city', city)
      .eq('status', 'approved')
      .eq('is_available', true)
      .contains('categories', [category])
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

    // Email each helper about the new job — fire and forget
    if (resendKey) {
      const catLabel = CATEGORY_LABELS[category] ?? 'Household help';
      const when = scheduled_date ?? 'flexible';
      const dashboardUrl = `${siteUrl}/student-dashboard`;

      await Promise.allSettled(
        (helpers as Array<{ id: string; name: string; phone: string; email?: string }>)
          .filter((h) => h.email)
          .map((h) => {
            const firstName = h.name.split(' ')[0];
            const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">New job near you 🏠</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 8px;color:#111827;font-size:15px;">Hi ${firstName}!</p>
    <p style="margin:0 0 4px;color:#374151;font-size:15px;"><strong>${catLabel}</strong> · ${city}</p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">When: ${when} · Offer expires in ${OFFER_TTL_MINUTES} min</p>
    <a href="${dashboardUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">View &amp; Accept →</a>
  </div>
</div>
</body></html>`;
            return fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: resendFrom,
                to: [h.email!],
                subject: `New VANO job in ${city} — ${catLabel}`,
                html,
                text: `Hi ${firstName}! New VANO job in ${city}: ${catLabel}, when: ${when}. Accept here: ${dashboardUrl} (expires in ${OFFER_TTL_MINUTES} min)`,
              }),
            });
          }),
      );
      console.log(`[dispatch] emailed ${helpers.filter((h: { email?: string }) => h.email).length} helper(s)`);
    } else {
      console.info('[dispatch] RESEND_API_KEY not set — skipping helper notifications');
    }

    return new Response(
      JSON.stringify({ dispatched: offers.length, city, bookingId, notified: Boolean(resendKey) }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dispatch] unhandled error', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
