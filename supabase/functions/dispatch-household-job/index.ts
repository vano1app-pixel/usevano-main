import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Triggered by stripe-webhook after payment completes (booking → 'pending').
// Also called by cancel-household-booking (helper_release) for re-dispatch.
//
// Dispatch priority:
//   1. Helpers in the same city with matching category (up to MAX_OFFERS).
//   2. If none found → fall back to ALL helpers on the platform with matching category.
//   3. If still none → email customer "we're on it, WhatsApp us if urgent" (NO auto-refund).
//
// Re-dispatch safety: stale pending offers (past expires_at) are expired first so
// the idempotency check doesn't block re-runs after the TTL window.

const MAX_OFFERS = 10;
// Helpers are notified by email only, and every offer sent so far expired
// unaccepted at the old 20-minute TTL — students simply don't see email that
// fast. 60 min keeps urgency but gives a realistic window, and still fits
// inside no-helper-fallback's 2-hour auto-refund cutoff.
const OFFER_TTL_MINUTES = 60;

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Shopping run',
  'dog-walk': 'Dog walk',
  garden: 'Garden help',
  moving: 'Moving help',
  cleaning: 'Cleaning',
  tutoring: 'Tutoring',
  handyman: 'Handyman',
  plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly',
  'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery',
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
    const booking = payload?.record ?? payload;
    const { id: bookingId, city, status, category, scheduled_date, price_estimate_cents } = booking;
    // Students respond to money: show what they'd keep (95% of the job).
    const earnCents = typeof price_estimate_cents === 'number' && price_estimate_cents > 0
      ? Math.floor(price_estimate_cents * 0.95)
      : null;

    if (status !== 'pending') {
      return new Response('Not a pending booking — skipping', { status: 200 });
    }
    if (!bookingId) {
      return new Response('Missing booking id', { status: 400 });
    }

    // Expire any stale pending offers so re-dispatch isn't blocked by the idempotency check.
    await supabase
      .from('household_job_offers')
      .update({ status: 'expired' })
      .eq('booking_id', bookingId)
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    // Idempotency: skip if non-expired offers already exist.
    const { count: existingOffers } = await supabase
      .from('household_job_offers')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .neq('status', 'expired');

    if (existingOffers && existingOffers > 0) {
      return new Response('Offers already sent', { status: 200 });
    }

    // Find helpers in the booking city first (bookings without a city skip
    // straight to the platform-wide search below).
    let helpers: Array<{ id: string; name: string; phone: string; email?: string }> | null = null;
    if (city) {
      const { data: cityHelpers, error: helpersError } = await supabase
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
      helpers = cityHelpers;
    }

    let expandedSearch = false;

    // No helpers in city — fall back to ALL approved helpers on the platform.
    if (!helpers || helpers.length === 0) {
      console.warn(`[dispatch] no helpers in ${city ?? 'unknown city'} for ${bookingId} — expanding to platform-wide search`);
      const { data: allHelpers, error: allErr } = await supabase
        .from('household_helpers')
        .select('id, name, phone, email')
        .eq('status', 'approved')
        .eq('is_available', true)
        .contains('categories', [category])
        .order('accepted_count', { ascending: true })
        .limit(MAX_OFFERS);

      if (!allErr && allHelpers && allHelpers.length > 0) {
        helpers = allHelpers;
        expandedSearch = true;
        console.log(`[dispatch] platform-wide search found ${helpers.length} helper(s)`);
      }
    }

    // Still no helpers anywhere — notify customer and admin, do NOT refund.
    if (!helpers || helpers.length === 0) {
      console.warn(`[dispatch] no helpers found anywhere for booking ${bookingId} (${category})`);

      const { data: fullBooking } = await supabase
        .from('household_bookings')
        .select('customer_name, customer_email')
        .eq('id', bookingId)
        .maybeSingle() as { data: { customer_name?: string; customer_email?: string } | null };

      const custEmail = fullBooking?.customer_email;
      const custName = fullBooking?.customer_name ?? 'there';
      const catLabel = CATEGORY_LABELS[category] ?? 'job';
      const trackUrl = `${siteUrl}/track/${bookingId}`;
      const ref = bookingId.slice(-8).toUpperCase();

      if (resendKey && custEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [custEmail],
            subject: `We're finding your helper — VANO`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">We're on it 🔍</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      We're actively searching for a helper for your <strong>${catLabel}</strong> in ${city ?? 'your area'}.
      We'll confirm your helper as soon as we find the right match — your booking is secure.
    </p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      Need it urgently or want an update?
    </p>
    <a href="https://wa.me/353899817111" style="display:inline-block;background:#25d366;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;margin-bottom:12px;">💬 WhatsApp us</a>
    <br>
    <a href="${trackUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;text-decoration:none;border:1px solid #e5e7eb;margin-top:8px;">Track booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · You won't be charged anything until a helper is confirmed.</p>
  </div>
</div>
</body></html>`,
            text: `Hi ${custName}, we're actively finding a helper for your ${catLabel} in ${city ?? 'your area'}. Your booking is secure. Need an update? WhatsApp +353 89 981 7111. Track: ${trackUrl}. Ref: ${ref}`,
          }),
        }).catch(() => {});
      }

      const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
      if (resendKey && adminEmail) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [adminEmail],
            subject: `🚨 No helpers found — ${catLabel} in ${city ?? '?'} — ${ref}`,
            text: `No helpers available for booking ${ref}.\nCategory: ${catLabel}\nCity: ${city ?? '—'}\nBooking ID: ${bookingId}\nCustomer: ${custName} (${custEmail ?? '—'})\n\nACTION NEEDED: manually find a helper or issue refund.`,
          }),
        }).catch(() => {});
      }

      return new Response(JSON.stringify({ dispatched: 0, city, bookingId, noHelpers: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000).toISOString();

    const offers = helpers.map((h: { id: string }) => ({
      booking_id: bookingId,
      helper_id: h.id,
      expires_at: expiresAt,
      status: 'pending',
    }));

    const { error: insertError } = await supabase
      .from('household_job_offers')
      .upsert(offers, { onConflict: 'booking_id,helper_id', ignoreDuplicates: true });

    if (insertError) {
      console.error('[dispatch] insert offers error', insertError);
      return new Response('Failed to insert offers', { status: 500 });
    }

    console.log(`[dispatch] offered booking ${bookingId} to ${offers.length} helper(s)${expandedSearch ? ' (platform-wide)' : ` in ${city}`}`);

    // Email each helper with a direct link to the specific job.
    if (resendKey) {
      const catLabel = CATEGORY_LABELS[category] ?? 'Household help';
      const when = scheduled_date ?? 'flexible';
      const jobUrl = `${siteUrl}/student-job/${bookingId}`;

      const emailResults = await Promise.allSettled(
        (helpers as Array<{ id: string; name: string; phone: string; email?: string }>)
          .filter((h) => h.email)
          .map(async (h) => {
            const firstName = h.name.split(' ')[0];
            const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">New job available 🏠</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 8px;color:#111827;font-size:15px;">Hi ${firstName}!</p>
    ${earnCents ? `<p style="margin:0 0 4px;color:#111827;font-size:26px;font-weight:800;">Earn €${(earnCents / 100).toFixed(2)}</p>` : ''}
    <p style="margin:0 0 4px;color:#374151;font-size:15px;"><strong>${catLabel}</strong> · ${city ?? 'Ireland'}</p>
    <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">When: ${when} · First to accept gets it · expires in ${OFFER_TTL_MINUTES} min</p>
    <a href="${jobUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">View &amp; Accept →</a>
  </div>
</div>
</body></html>`;
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: resendFrom,
                to: [h.email!],
                subject: earnCents
                  ? `Earn €${(earnCents / 100).toFixed(2)} — ${catLabel} in ${city ?? 'your area'}`
                  : `New VANO job — ${catLabel} in ${city ?? 'your area'}`,
                html,
                text: `Hi ${firstName}! ${earnCents ? `Earn €${(earnCents / 100).toFixed(2)} — ` : ''}${catLabel} in ${city ?? 'your area'}, when: ${when}. First to accept gets it: ${jobUrl} (expires in ${OFFER_TTL_MINUTES} min)`,
              }),
            });
            if (!res.ok) {
              const body = await res.text().catch(() => '');
              console.warn(`[dispatch] Resend rejected email to ${h.email} (${res.status}): ${body}`);
            } else {
              console.log(`[dispatch] email sent to ${h.email}`);
            }
            return res.ok;
          }),
      );
      const sent = emailResults.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`[dispatch] emailed ${sent}/${helpers.filter((h: { email?: string }) => h.email).length} helper(s) — from: ${resendFrom}`);
    } else {
      console.info('[dispatch] RESEND_API_KEY not set — skipping helper notifications');
    }

    return new Response(
      JSON.stringify({ dispatched: offers.length, city, bookingId, expandedSearch, notified: Boolean(resendKey) }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dispatch] unhandled error', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
