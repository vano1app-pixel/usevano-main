import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHouseholdPush } from "../_shared/householdPush.ts";

// Called by StudentDashboard after a helper claims a booking.
// Pay-after-accept: creates the Stripe Checkout session for the booking
// (customers no longer pay upfront) and sends the customer a
// "your helper is confirmed — pay to secure" email via Resend.
// Requires a valid user JWT — verifies the caller is the assigned student.
//
// Referral programme: if create-household-payment-checkout reserved a
// discount on the booking (booking_data.referral_discount_cents), it is
// applied to the Stripe session here as an ad-hoc coupon and the referral
// row ids ride the session metadata so stripe-webhook can settle them when
// the payment lands. Coupon failure degrades to a full-price pay link.

function formEncode(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

// Customer/helper names come from free-text form fields — escape before
// interpolating into email HTML.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── SMS via Twilio ────────────────────────────────────────────────────────────────────────────
// Quick-book customers usually leave only a phone number, so SMS is the main
// channel for the pay link. Uses TWILIO_SMS_FROM if set (SMS-capable number
// or alphanumeric 'VANO'), falling back to TWILIO_FROM_NUMBER. No-ops
// gracefully when Twilio isn't configured.
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
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  // WhatsApp preferred — no Irish carrier filtering, higher open rates.
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM')?.trim();
  if (waFrom) {
    const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
    try {
      const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `whatsapp:${e164}`, From: from, Body: body }).toString(),
      });
      if (!resp.ok) console.warn('[whatsapp] twilio error', resp.status, (await resp.text()).slice(0, 200));
      else console.log(`[whatsapp] sent to ${e164}`);
      return resp.ok;
    } catch (e) {
      console.warn('[whatsapp] twilio exception', e);
      return false;
    }
  }
  // SMS fallback — off until a carrier-trusted Irish number is configured.
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const from = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!from || from.startsWith('whatsapp:')) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: e164, From: from, Body: body }).toString(),
    });
    if (!resp.ok) console.warn('[sms] twilio error', resp.status, (await resp.text()).slice(0, 200));
    else console.log(`[sms] sent to ${e164}`);
    return resp.ok;
  } catch (e) {
    console.warn('[sms] twilio exception', e);
    return false;
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_LABELS: Record<string, string> = {
  shopping: 'Laundry', 'dog-walk': 'Dog walk', garden: 'Garden help',
  moving: 'Moving help', cleaning: 'Cleaning', tutoring: 'Tutoring',
  handyman: 'Handyman', plumbing: 'Plumbing help',
  'furniture-assembly': 'Furniture assembly', 'tech-help': 'Tech help',
  'wait-delivery': 'Wait for delivery', 'post-office': 'Post office run',
  'pharmacy-run': 'Pharmacy run', 'grocery-shopping': 'Grocery shopping',
  'dog-walking': 'Dog walking', 'lawn-mowing': 'Lawn mowing',
  'moving-help': 'Moving help', 'outdoor-cleaning': 'Outdoor cleaning',
  'tutoring-grinds': 'Tutoring & grinds', 'midnight-lift': 'Midnight Lift',
  other: 'General help',
};

const SLOT_LABELS: Record<string, string> = {
  morning: 'morning (8am–12pm)',
  afternoon: 'afternoon (12–5pm)',
  evening: 'evening (5–8pm)',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ok = (data: Record<string, unknown>) =>
    new Response(JSON.stringify(data), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  const bad = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return bad(401, 'Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Internal service-role path: accept-job (one-tap link) has already claimed
    // the booking server-side and can't present a user JWT. Trust it only when
    // the bearer IS the service-role key AND it flags itself; the assigned
    // student is then read from the booking row, not from a session.
    const isInternal = req.headers.get('x-internal-accept') === '1' &&
      authHeader === `Bearer ${serviceKey}`;

    let callerUserId: string | null = null;
    if (!isInternal) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) return bad(401, 'Invalid session');
      callerUserId = user.id;
    }

    const { booking_id } = await req.json().catch(() => ({})) as { booking_id?: string };
    if (!booking_id) return bad(400, 'booking_id required');

    const supabase = createClient(supabaseUrl, serviceKey);

    // For a user call, only proceed if this user is the assigned student. For
    // the internal path, load by id (student_id was just set by accept-job).
    let bookingQuery = supabase
      .from('household_bookings')
      .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, time_slot, student_id, price_estimate_cents, booking_data, paid_at, stripe_checkout_url')
      .eq('id', booking_id);
    if (!isInternal) bookingQuery = bookingQuery.eq('student_id', callerUserId!);

    const { data: booking } = await bookingQuery.maybeSingle() as { data: Record<string, unknown> | null };

    if (!booking) return bad(404, 'Booking not found or not assigned to you');

    // The assigned helper's user id: from the verified caller on the user path,
    // or from the booking row accept-job just claimed on the internal one-tap
    // path. (`user` is scoped to the auth block above and must not be used here.)
    const studentUserId = (isInternal ? booking.student_id : callerUserId) as string | null;

    // Insert an 'accepted' update row if one doesn't already exist
    const { count: existingAccepted } = await supabase
      .from('household_job_updates')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', booking_id)
      .eq('status', 'accepted');
    if (!existingAccepted) {
      await supabase.from('household_job_updates').insert({ booking_id, status: 'accepted' });
    }

    // Best-effort web push to the customer's browser — never blocks the flow.
    void sendHouseholdPush(booking_id, 'accepted');

    // ── Pay-after-accept: create the Stripe Checkout session now ──────────────────
    // A helper is confirmed, so this is the moment the customer pays.
    // Idempotent: reuse the session created on a previous acceptance
    // (e.g. helper released → re-dispatched → accepted again).
    const priceCents = Number(booking.price_estimate_cents) || 0;
    const bookingData = (booking.booking_data ?? {}) as {
      service_fee_cents?: number;
      referral_discount_cents?: number;
      referral_welcome_id?: string;
      redeem_referral_id?: string;
    };
    const serviceFeeCents = Number(bookingData.service_fee_cents) || 0;
    // Referral discount reserved at booking time. Re-capped here so the
    // charge can never drop under €1 even if booking_data was hand-edited.
    const reservedDiscountCents = Math.min(
      Math.max(0, Number(bookingData.referral_discount_cents) || 0),
      Math.max(0, priceCents + serviceFeeCents - 100),
    );
    let appliedDiscountCents = 0;
    let totalCents = priceCents + serviceFeeCents;
    let payUrl = (booking.stripe_checkout_url as string | null) ?? null;

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    // ── Card on file → auto-charge (OFF until VANO_AUTO_CHARGE=1) ────────────
    // If this household has a saved card (from a previous paid booking) and
    // there's no referral discount to reconcile, charge it off-session now —
    // no pay step for the customer. Stamps the booking paid directly because an
    // off-session PaymentIntent has no checkout.session webhook. ANY failure
    // leaves payUrl + paid_at untouched, so the normal pay-link block below
    // runs as the fallback. Flag-gated so it can't fire until it's been
    // verified in Stripe test mode.
    let autoCharged = false;
    if (
      Deno.env.get('VANO_AUTO_CHARGE') === '1' &&
      !payUrl && !booking.paid_at && priceCents > 0 && STRIPE_SECRET_KEY &&
      reservedDiscountCents < 100
    ) {
      try {
        const phone = (booking.customer_phone as string | null)?.trim();
        if (phone) {
          const { data: cust } = await supabase
            .from('household_customers')
            .select('stripe_customer_id')
            .eq('phone', phone)
            .maybeSingle() as { data: { stripe_customer_id: string } | null };
          const customerId = cust?.stripe_customer_id;
          if (customerId) {
            const pmResp = await fetch(
              `https://api.stripe.com/v1/payment_methods?customer=${customerId}&type=card&limit=1`,
              { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } },
            );
            const pmId = pmResp.ok
              ? ((await pmResp.json()) as { data?: { id: string }[] }).data?.[0]?.id
              : undefined;
            if (pmId) {
              const piResp = await fetch('https://api.stripe.com/v1/payment_intents', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formEncode({
                  amount: String(priceCents + serviceFeeCents),
                  currency: 'eur',
                  customer: customerId,
                  payment_method: pmId,
                  off_session: 'true',
                  confirm: 'true',
                  'metadata[household_booking_id]': booking_id,
                  description: `VANO — ${CATEGORY_LABELS[booking.category as string] ?? 'Household help'} (card on file)`,
                }),
              });
              if (piResp.ok) {
                const pi = (await piResp.json()) as { id: string; status: string };
                if (pi.status === 'succeeded') {
                  const paidIso = new Date().toISOString();
                  await supabase.from('household_bookings')
                    .update({ paid_at: paidIso, stripe_payment_intent_id: pi.id })
                    .eq('id', booking_id).is('paid_at', null);
                  // Reflect locally so the SMS/email use the paid/track copy.
                  (booking as { paid_at?: string | null }).paid_at = paidIso;
                  autoCharged = true;
                }
              } else {
                console.warn('[notify-household-accepted] off-session charge failed', (await piResp.text()).slice(0, 300));
              }
            }
          }
        }
      } catch (e) {
        console.warn('[notify-household-accepted] auto-charge threw', e);
      }
    }

    if (!payUrl && !booking.paid_at && priceCents > 0 && STRIPE_SECRET_KEY) {
      // Mint the referral coupon first so the session params can include it.
      // Any failure here simply produces a full-price pay link.
      let couponId: string | null = null;
      if (reservedDiscountCents >= 100) {
        try {
          const couponResp = await fetch('https://api.stripe.com/v1/coupons', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formEncode({
              amount_off: String(reservedDiscountCents),
              currency: 'eur',
              duration: 'once',
              name: bookingData.referral_welcome_id ? 'Friend discount' : 'Referral credit',
            }),
          });
          if (couponResp.ok) {
            couponId = ((await couponResp.json()) as { id: string }).id;
          } else {
            console.warn('[notify-household-accepted] coupon create failed', (await couponResp.text()).slice(0, 300));
          }
        } catch (e) {
          console.warn('[notify-household-accepted] coupon create threw', e);
        }
        if (couponId) appliedDiscountCents = reservedDiscountCents;
      }

      const origin = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
      const checkoutParams: Record<string, string> = {
        mode: 'payment',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][unit_amount]': String(priceCents),
        'line_items[0][price_data][product_data][name]': `VANO — ${CATEGORY_LABELS[booking.category as string] ?? 'Household help'}`,
        'line_items[0][price_data][product_data][description]': 'Your helper is confirmed — this payment secures the booking',
        'line_items[0][quantity]': '1',
        ...(serviceFeeCents > 0 ? {
          'line_items[1][price_data][currency]': 'eur',
          'line_items[1][price_data][unit_amount]': String(serviceFeeCents),
          'line_items[1][price_data][product_data][name]': 'VANO service fee',
          'line_items[1][quantity]': '1',
        } : {}),
        'payment_intent_data[capture_method]': 'automatic',
        'payment_intent_data[metadata][household_booking_id]': booking_id,
        // Stripe's own itemised receipt (amount + line items) — the only
        // written proof of charge a customer gets unless they added an email
        // later, so send it whenever we have an address to send it to.
        ...(booking.customer_email ? { 'payment_intent_data[receipt_email]': String(booking.customer_email).toLowerCase() } : {}),
        // Save the card for future off-session use — the foundation for
        // "card on file → auto-charge" so repeat bookings need no pay step.
        // Additive: doesn't change what's charged now, just stores the method
        // on a Stripe customer. (Step 2 reuses it by looking the customer up by
        // phone and charging off-session at accept time.) Wallets (Apple/Google
        // Pay / Link) still appear automatically — methods aren't restricted.
        'customer_creation': 'always',
        'payment_intent_data[setup_future_usage]': 'off_session',
        ...(booking.customer_email ? { customer_email: String(booking.customer_email).toLowerCase() } : {}),
        success_url: `${origin}/track/${booking_id}?paid=true`,
        cancel_url: `${origin}/track/${booking_id}`,
        'metadata[household_booking_id]': booking_id,
        ...(couponId ? { 'discounts[0][coupon]': couponId } : {}),
        ...(couponId && bookingData.referral_welcome_id ? { 'metadata[referral_welcome_id]': bookingData.referral_welcome_id } : {}),
        ...(couponId && bookingData.redeem_referral_id ? { 'metadata[redeem_referral_id]': bookingData.redeem_referral_id } : {}),
        client_reference_id: booking_id,
      };
      try {
        const stripeResp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formEncode(checkoutParams),
        });
        if (stripeResp.ok) {
          const session = await stripeResp.json() as { id: string; url: string };
          payUrl = session.url;
          await supabase
            .from('household_bookings')
            .update({
              stripe_checkout_url: session.url,
              payment_requested_at: new Date().toISOString(),
              stripe_payment_intent_id: session.id,
            })
            .eq('id', booking_id);
        } else {
          console.error('[notify-household-accepted] stripe session error', stripeResp.status, (await stripeResp.text()).slice(0, 300));
        }
      } catch (e) {
        console.error('[notify-household-accepted] stripe session exception', e);
      }
    } else if (payUrl && reservedDiscountCents >= 100) {
      // Session already existed (re-acceptance) — it was created with the
      // discount, so quoted amounts should still reflect it.
      appliedDiscountCents = reservedDiscountCents;
    }
    totalCents = priceCents + serviceFeeCents - appliedDiscountCents;

    // Quick-book customers often leave no email — keep going so the admin
    // email below still fires (it carries the pay link to WhatsApp onward).
    const hasCustomerEmail = !!booking?.customer_email;

    // Get helper details — household_helpers first, profiles fallback
    let helperFirstName = 'Your helper';
    let helperId: string | null = null;
    let helperPhoto: string | null = null;
    let helperRating: number | null = null;
    let helperJobs = 0;
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, name, photo_url, average_rating, accepted_count')
      .eq('user_id', studentUserId)
      .maybeSingle() as { data: { id?: string; name?: string; photo_url?: string | null; average_rating?: number | null; accepted_count?: number } | null };
    if (helper?.name) {
      helperFirstName = helper.name.split(' ')[0];
      helperId     = helper.id ?? null;
      helperPhoto  = helper.photo_url || null;
      helperRating = helper.average_rating ?? null;
      helperJobs   = helper.accepted_count ?? 0;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', studentUserId)
        .maybeSingle() as { data: { display_name?: string } | null };
      if (profile?.display_name) helperFirstName = profile.display_name.split(' ')[0];
    }

    // SMS/WhatsApp the customer — most quick-book customers leave only a
    // phone number, so this is the primary channel for the trust moment.
    // The link is always the TRACK page, never the raw Stripe URL: it's
    // short and branded, the big "Pay €X to confirm" card is right there
    // (backed by the same checkout session), and the customer lands on the
    // live map + helper profile instead of a bare card form.
    {
      const phone = booking.customer_phone as string | null;
      if (phone) {
        const siteUrlSms = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
        const trackUrlSms = `${siteUrlSms}/track/${booking_id}`;
        const catSms = CATEGORY_LABELS[booking.category as string] ?? 'job';
        const discountSms = appliedDiscountCents > 0 ? ' (€5 referral discount applied)' : '';
        const smsBody = payUrl && !booking.paid_at
          ? `VANO: ${helperFirstName} accepted your ${catSms}! Confirm & pay €${(totalCents / 100).toFixed(2)}${discountSms} securely, and watch them arrive live: ${trackUrlSms}`
          : autoCharged
            ? `VANO: ${helperFirstName} accepted your ${catSms}! €${(totalCents / 100).toFixed(2)} was charged to your saved card. Track here: ${trackUrlSms}`
            : `VANO: ${helperFirstName} accepted your ${catSms}! Track here: ${trackUrlSms}`;
        await sendSms(phone, smsBody);
      }
    }

    const resendKey  = Deno.env.get('RESEND_API_KEY')?.trim();
    if (!resendKey) return ok({ ok: true, emailed: false, reason: 'no_api_key' });

    const from       = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
    const siteUrl    = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
    const trackUrl   = `${siteUrl}/track/${booking_id}`;
    const catLabel   = CATEGORY_LABELS[booking.category as string] ?? String(booking.category);
    const rawCustName = String(booking.customer_name || '');
    const custName   = rawCustName && rawCustName !== 'Guest' ? rawCustName : 'there';
    const ref        = booking_id.slice(-8).toUpperCase();

    const dateStr = booking.scheduled_date === 'today' ? 'today'
      : booking.scheduled_date === 'tomorrow' ? 'tomorrow'
      : booking.scheduled_date ?? '';
    const slotStr = booking.time_slot ? ` ${SLOT_LABELS[booking.time_slot as string] ?? booking.time_slot}` : '';
    const whenLine = dateStr ? `${dateStr}${slotStr}` : '';

    // HTML-safe variants for interpolation (raw values stay in text/subject).
    const custNameHtml   = escapeHtml(custName);
    const helperNameHtml = escapeHtml(helperFirstName);
    const whenLineHtml   = escapeHtml(whenLine);
    const catLabelHtml   = escapeHtml(catLabel);

    const profileUrl  = helperId ? `${siteUrl}/helpers/${helperId}` : null;
    const ratingBits  = [
      helperRating ? `&#9733; ${Number(helperRating).toFixed(1)}` : null,
      helperJobs > 0 ? `${helperJobs} task${helperJobs === 1 ? '' : 's'} done` : null,
    ].filter(Boolean).join(' &middot; ');
    const helperCard = helperId ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#eef3ef;border:1px solid #d5e2d8;border-radius:14px;margin:0 0 24px;">
      <tr>
        ${helperPhoto ? `<td style="padding:14px 0 14px 16px;width:64px;vertical-align:middle;"><img src="${escapeHtml(helperPhoto)}" alt="${helperNameHtml}" width="52" height="52" style="border-radius:50%;object-fit:cover;display:block;" /></td>` : ''}
        <td style="padding:14px 16px;vertical-align:middle;">
          <p style="margin:0;color:#111827;font-size:15px;font-weight:700;">${helperNameHtml}</p>
          ${ratingBits ? `<p style="margin:2px 0 0;color:#4b5563;font-size:13px;">${ratingBits}</p>` : ''}
          <p style="margin:4px 0 0;font-size:13px;"><a href="${profileUrl}" style="color:#4a7c59;font-weight:600;text-decoration:none;">View ${helperNameHtml}'s profile &rarr;</a></p>
        </td>
      </tr>
    </table>` : '';

    const discountLine = appliedDiscountCents > 0
      ? `<p style="margin:0 0 14px;color:#4a7c59;font-size:13px;font-weight:600;">🎁 €${(appliedDiscountCents / 100).toFixed(0)} referral discount applied</p>`
      : '';

    // Inbox preview line (hidden in the body) — the hook, not "Hi there,".
    const preheader = payUrl && !booking.paid_at
      ? `Pay €${(totalCents / 100).toFixed(2)} to lock in ${helperFirstName} — then watch them arrive on the live map.`
      : `${helperFirstName} is confirmed — track your booking live.`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Helper confirmed</title></head><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Helper confirmed</p>
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperNameHtml} is on your job ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custNameHtml},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperNameHtml}</strong> has accepted your <strong>${catLabelHtml}</strong>${whenLineHtml ? ' for <strong>' + whenLineHtml + '</strong>' : ''}.
    </p>
    ${helperCard}
    ${payUrl && !booking.paid_at ? `
    <div style="background:#f6f8f6;border:1px solid #d5e2d8;border-radius:14px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 4px;color:#111827;font-size:15px;font-weight:700;">Secure your booking — €${(totalCents / 100).toFixed(2)}</p>
      ${discountLine}
      <p style="margin:0 0 14px;color:#4b5563;font-size:13px;line-height:1.5;">Pay securely by card to confirm ${helperNameHtml}. Your money's protected until the job's done — no cash needed on the day.</p>
      <a href="${payUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;">Confirm &amp; pay €${(totalCents / 100).toFixed(2)} →</a>
    </div>` : ''}
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      You'll get another message when they're on their way — including a <strong>live map</strong> so you can track exactly where they are.
    </p>
    <a href="${trackUrl}" style="display:inline-block;background:${payUrl && !booking.paid_at ? '#f3f4f6' : '#4a7c59'};color:${payUrl && !booking.paid_at ? '#374151' : '#fff'};font-size:14px;font-weight:600;padding:13px 28px;border-radius:100px;text-decoration:none;${payUrl && !booking.paid_at ? 'border:1px solid #e5e7eb;' : ''}">Track booking →</a>
    <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">Ref: ${ref} · Questions? WhatsApp us: <a href="https://wa.me/353899817111" style="color:#9ca3af;">+353 89 981 7111</a></p>
  </div>
</div>
</body></html>`;

    let emailedOk = false;
    if (hasCustomerEmail) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [booking.customer_email as string],
          subject: payUrl && !booking.paid_at
            ? `${helperFirstName} accepted your ${catLabel} — confirm & pay €${(totalCents / 100).toFixed(2)}`
            : `${helperFirstName} is on your ${catLabel} — VANO`,
          html,
          text: `Hi ${custName}, ${helperFirstName} has accepted your ${catLabel}${whenLine ? ' for ' + whenLine : ''}.${payUrl && !booking.paid_at ? ` Confirm & pay €${(totalCents / 100).toFixed(2)}${appliedDiscountCents > 0 ? ' (€5 referral discount applied)' : ''} securely here: ${payUrl}.` : ''} Track: ${trackUrl}. Ref: ${ref}`,
        }),
      });
      if (!res.ok) console.warn('[notify-household-accepted] Resend error', res.status, await res.text());
      emailedOk = res.ok;
    }

    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
    if (adminEmail) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [adminEmail],
          subject: `✅ Job claimed — ${helperFirstName} on ${catLabel}${booking.paid_at ? '' : ' (payment requested)'}`,
          text: [
            `${helperFirstName} just claimed a job.`,
            `Job: ${catLabel}`,
            `Customer: ${custName}`,
            `Email: ${booking.customer_email ?? '—'}`,
            `When: ${whenLine || 'Flexible'}`,
            `Payment: ${booking.paid_at ? 'PAID' : `UNPAID — customer asked to pay €${(totalCents / 100).toFixed(2)}`}`,
            ...(appliedDiscountCents > 0 ? [`Referral discount applied: -€${(appliedDiscountCents / 100).toFixed(2)}`] : []),
            ...(payUrl && !booking.paid_at ? [`Pay link (WhatsApp it to the customer if they have no email): ${payUrl}`] : []),
            `Ref: ${ref}`,
            `Track: ${trackUrl}`,
          ].join('\n'),
        }),
      }).catch(() => {});
    }

    return ok({ ok: true, emailed: emailedOk, pay_url: payUrl });
  } catch (err) {
    console.error('[notify-household-accepted] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
