import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendHouseholdPush } from "../_shared/householdPush.ts";
import { releaseBookingMoney } from "../_shared/bookingMoney.ts";

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
      .select('id, customer_name, customer_email, customer_phone, category, scheduled_date, time_slot, student_id, price_estimate_cents, booking_data, paid_at, stripe_checkout_url, stripe_payment_intent_id')
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

    // Get helper details — household_helpers first, profiles fallback.
    // Resolved BEFORE the payment blocks so the Stripe line items can name the
    // helper: the receipt is part of the contract moment ("you're paying Seán,
    // an independent provider, via VANO"), not just the emails.
    let helperFirstName = 'Your helper';
    let helperId: string | null = null;
    let helperPhoto: string | null = null;
    let helperRating: number | null = null;
    let helperJobs = 0;
    let helperPaymentHandle: string | null = null;
    const { data: helper } = await supabase
      .from('household_helpers')
      .select('id, name, photo_url, average_rating, accepted_count, payment_handle')
      .eq('user_id', studentUserId)
      .maybeSingle() as { data: { id?: string; name?: string; photo_url?: string | null; average_rating?: number | null; accepted_count?: number; payment_handle?: string | null } | null };
    if (helper?.name) {
      helperFirstName = helper.name.split(' ')[0];
      helperId     = helper.id ?? null;
      helperPhoto  = helper.photo_url || null;
      helperRating = helper.average_rating ?? null;
      helperJobs   = helper.accepted_count ?? 0;
      helperPaymentHandle = (helper.payment_handle ?? '').trim() || null;
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', studentUserId)
        .maybeSingle() as { data: { display_name?: string } | null };
      if (profile?.display_name) helperFirstName = profile.display_name.split(' ')[0];
    }
    // True when we resolved a real first name (not the generic fallback).
    const helperNamed = helperFirstName !== 'Your helper';

    // ── Confirm-on-accept: what the customer's card is charged ─────────────
    // DIRECT-PAY bookings (booking_data.direct_pay): the card charge is ONLY
    // Vano's fee (+ optional €2 Cover) — fee_due_cents, already net of any
    // loyalty/referral fee discount from checkout. The JOB money is paid to
    // the helper directly (Revolut/cash) and never touches Vano.
    // LEGACY bookings (created before the direct-pay deploy, still in flight):
    // keep the old full charge (job + 7.5% fee, Stripe coupon for referrals).
    const priceCents = Number(booking.price_estimate_cents) || 0;
    const bookingData = (booking.booking_data ?? {}) as {
      direct_pay?: boolean;
      fee_due_cents?: number;
      vano_fee_cents?: number;
      cover_cents?: number;
      cover_opted?: boolean;
      fee_waived_loyalty?: boolean;
      service_fee_cents?: number;
      referral_discount_cents?: number;
      referral_welcome_id?: string;
      redeem_referral_id?: string;
      /** Auth-at-booking: set by the fee-auth webhook — an uncaptured hold
       *  exists on stripe_payment_intent_id, waiting for this accept. */
      fee_authorized_at?: string;
    };
    const directPay = bookingData.direct_pay === true;
    const coverCents = directPay ? Math.max(0, Number(bookingData.cover_cents) || 0) : 0;
    const serviceFeeCents = directPay ? 0 : (Number(bookingData.service_fee_cents) || 0);
    // Legacy referral discount (Stripe coupon). Direct-pay bookings arrive
    // with the discount already baked into fee_due_cents — no coupon needed.
    const reservedDiscountCents = directPay ? 0 : Math.min(
      Math.max(0, Number(bookingData.referral_discount_cents) || 0),
      Math.max(0, priceCents + serviceFeeCents - 100),
    );
    // What the card is charged when the customer confirms.
    const chargeCents = directPay
      ? Math.max(0, Number(bookingData.fee_due_cents) || 0)
      : priceCents + serviceFeeCents;
    let appliedDiscountCents = 0;
    let totalCents = chargeCents;
    let payUrl = (booking.stripe_checkout_url as string | null) ?? null;

    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

    // Stamp the helper's payment details onto the booking so the customer's
    // tracking page can show "Pay {name} — @revtag" at the right moment.
    // Atomic top-level merge (never clobbers other booking_data keys).
    if (directPay) {
      try {
        await supabase.rpc('merge_booking_data', {
          p_id: booking_id,
          p_patch: { helper_first_name: helperFirstName, helper_payment_handle: helperPaymentHandle },
        });
      } catch (e) {
        console.warn('[notify-household-accepted] payment-handle stamp failed (non-fatal)', e);
      }
    }

    // ── Fee-free confirm (loyalty / referral covered the whole fee) ────────
    // Nothing to charge → no Stripe at all; the booking confirms instantly.
    let feeFree = false;
    if (directPay && chargeCents === 0 && !booking.paid_at) {
      const paidIso = new Date().toISOString();
      await supabase.from('household_bookings')
        .update({ paid_at: paidIso })
        .eq('id', booking_id).is('paid_at', null);
      (booking as { paid_at?: string | null }).paid_at = paidIso;
      feeFree = true;
    }

    // ── Auth-at-booking: CAPTURE the fee hold minted at booking ───────────
    // The card was authorized (manual capture) when the booking was placed;
    // a helper just accepted, so take the reserved fee NOW. Success = the
    // booking confirms instantly — no pay link, no second ask. Failure
    // (hold lapsed ~7d, card died) falls through to the classic pay-link
    // block below — the existing remind-unpaid machinery is the designed
    // fallback — and the dead hold is cancelled only AFTER the new session
    // has overwritten the row, so a stray release event can't match it.
    let feeCaptured = false;
    let captureFailedHoldId: string | null = null;
    {
      const heldIntentId = String(booking.stripe_payment_intent_id ?? '').trim();
      if (
        directPay && !booking.paid_at && chargeCents > 0 && STRIPE_SECRET_KEY &&
        heldIntentId.startsWith('pi_') && bookingData.fee_authorized_at
      ) {
        try {
          const apiBase = (Deno.env.get('STRIPE_API_BASE') ?? 'https://api.stripe.com').replace(/\/$/, '');
          const capResp = await fetch(`${apiBase}/v1/payment_intents/${heldIntentId}/capture`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              // Replays (webhook regenerate loop, double accept-notify) must
              // never double-capture.
              'Idempotency-Key': `vano_fee_capture_${booking_id}`,
            },
            body: '',
          });
          const capText = capResp.ok ? '' : (await capResp.text().catch(() => '')).slice(0, 400);
          const alreadyCaptured = !capResp.ok && /already been captured|succeeded/i.test(capText);
          if (capResp.ok || alreadyCaptured) {
            const paidIso = new Date().toISOString();
            await supabase.from('household_bookings')
              .update({ paid_at: paidIso })
              .eq('id', booking_id).is('paid_at', null);
            (booking as { paid_at?: string | null }).paid_at = paidIso;
            feeCaptured = true;
            // Referral settlement — the webhook only settles session-metadata
            // referrals, and a capture fires no session event, so settle from
            // the booking_data ids here (CAS-guarded: replays are no-ops).
            try {
              if (bookingData.referral_welcome_id) {
                await supabase.from('household_referrals')
                  .update({ status: 'earned', earned_at: paidIso })
                  .eq('id', bookingData.referral_welcome_id)
                  .eq('status', 'pending');
              }
              if (bookingData.redeem_referral_id) {
                await supabase.from('household_referrals')
                  .update({ status: 'redeemed', redeemed_at: paidIso, redeemed_booking_id: booking_id })
                  .eq('id', bookingData.redeem_referral_id)
                  .eq('status', 'earned');
              }
            } catch (e) {
              console.warn('[notify-household-accepted] capture-time referral settle failed (non-fatal)', e);
            }
          } else {
            console.warn('[notify-household-accepted] fee capture failed — falling back to pay link', capResp.status, capText);
            captureFailedHoldId = heldIntentId;
            await supabase.rpc('merge_booking_data', {
              p_id: booking_id,
              p_patch: { fee_capture_failed_at: new Date().toISOString(), fee_capture_fail_reason: capText.slice(0, 160) || `HTTP ${capResp.status}` },
            }).then(() => {}, () => {});
          }
        } catch (e) {
          console.warn('[notify-household-accepted] fee capture threw — falling back to pay link', e);
          captureFailedHoldId = heldIntentId;
        }
      }
    }

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
      !payUrl && !booking.paid_at && chargeCents > 0 && STRIPE_SECRET_KEY &&
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
                  amount: String(chargeCents),
                  currency: 'eur',
                  customer: customerId,
                  payment_method: pmId,
                  off_session: 'true',
                  confirm: 'true',
                  'metadata[household_booking_id]': booking_id,
                  // The charge description is contract-moment copy too: the
                  // work is the helper's, VANO is the platform arranging it.
                  description: directPay
                    ? `VANO booking fee — ${CATEGORY_LABELS[booking.category as string] ?? 'Household help'}${helperNamed ? ` with ${helperFirstName}` : ''} (card on file). You pay your helper directly.`
                    : `${CATEGORY_LABELS[booking.category as string] ?? 'Household help'}${helperNamed ? ` with ${helperFirstName} (independent helper)` : ''} — arranged via VANO (card on file)`,
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

    if (!payUrl && !booking.paid_at && chargeCents > 0 && STRIPE_SECRET_KEY) {
      // Mint the referral coupon first so the session params can include it.
      // (Legacy bookings only — direct-pay fees arrive pre-discounted.)
      let couponId: string | null = null;
      if (!directPay && reservedDiscountCents >= 100) {
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
      const catLabelForLines = CATEGORY_LABELS[booking.category as string] ?? 'Household help';
      // DIRECT-PAY: the card charge is Vano's fee (+ optional Cover) — the
      // receipt says so plainly, and names the job money the customer pays
      // the helper directly. LEGACY: the old job + platform-fee lines.
      const lineItems: Record<string, string> = directPay
        ? {
            'line_items[0][price_data][currency]': 'eur',
            'line_items[0][price_data][unit_amount]': String(Math.max(0, chargeCents - coverCents)),
            'line_items[0][price_data][product_data][name]': 'VANO booking fee',
            'line_items[0][price_data][product_data][description]':
              `Matching, ID verification & support for your ${catLabelForLines}${helperNamed ? ` with ${helperFirstName}` : ''}. ` +
              `The job itself (€${(priceCents / 100).toFixed(2)}) is paid to ${helperNamed ? helperFirstName : 'your helper'} directly when the work is done.`,
            'line_items[0][quantity]': '1',
            ...(coverCents > 0 ? {
              'line_items[1][price_data][currency]': 'eur',
              'line_items[1][price_data][unit_amount]': String(coverCents),
              'line_items[1][price_data][product_data][name]': 'Vano Cover — accidental damage up to €250',
              'line_items[1][quantity]': '1',
            } : {}),
          }
        : {
            'line_items[0][price_data][currency]': 'eur',
            'line_items[0][price_data][unit_amount]': String(priceCents),
            'line_items[0][price_data][product_data][name]':
              `${catLabelForLines}${helperNamed ? ` — with ${helperFirstName}` : ''}`,
            'line_items[0][price_data][product_data][description]':
              `Carried out by ${helperNamed ? `${helperFirstName}, an independent helper` : 'an independent helper'} — booked, paid and supported via VANO. This payment secures the booking.`,
            'line_items[0][quantity]': '1',
            ...(serviceFeeCents > 0 ? {
              'line_items[1][price_data][currency]': 'eur',
              'line_items[1][price_data][unit_amount]': String(serviceFeeCents),
              'line_items[1][price_data][product_data][name]': 'VANO platform fee',
              'line_items[1][quantity]': '1',
            } : {}),
          };
      const checkoutParams: Record<string, string> = {
        mode: 'payment',
        ...lineItems,
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

    // Capture-failure cleanup: the fallback pay-link session (if minted) has
    // overwritten stripe_payment_intent_id with its cs_, so releasing what's
    // left of the dead hold can't be mistaken for this booking's live money —
    // the customer must never carry a hold AND a fresh charge for one fee.
    if (captureFailedHoldId && STRIPE_SECRET_KEY) {
      const released = await releaseBookingMoney({
        stripeKey: STRIPE_SECRET_KEY,
        action: 'cancel_pi',
        stripeId: captureFailedHoldId,
        idemSuffix: booking_id,
        apiBase: Deno.env.get('STRIPE_API_BASE') ?? undefined,
      });
      if (released.ok) {
        await supabase.rpc('merge_booking_data', {
          p_id: booking_id,
          p_patch: { fee_auth_canceled_at: new Date().toISOString() },
        }).then(() => {}, () => {});
      } else {
        console.warn('[notify-household-accepted] dead-hold release failed (Stripe auto-expires holds ~7d)', released.error);
      }
    }

    totalCents = directPay ? chargeCents : priceCents + serviceFeeCents - appliedDiscountCents;
    // Direct-pay message building blocks: the fee the card pays now, and the
    // job money the customer hands the helper directly at the end.
    const feeStr = `€${(totalCents / 100).toFixed(2)}`;
    const jobStr = `€${(priceCents / 100).toFixed(2)}`;
    const payHelperHow = helperPaymentHandle ? ` (Revolut ${helperPaymentHandle} or cash)` : ' (Revolut or cash)';

    // Quick-book customers often leave no email — keep going so the admin
    // email below still fires (it carries the pay link to WhatsApp onward).
    const hasCustomerEmail = !!booking?.customer_email;

    // SMS the customer the pay link — most quick-book customers leave only a
    // phone number, so this is the primary channel for the trust moment.
    let smsSent = false;
    {
      const phone = booking.customer_phone as string | null;
      if (phone) {
        const siteUrlSms = (Deno.env.get('SITE_URL')?.trim() || 'https://vanojobs.com').replace(/\/+$/, '');
        const catSms = CATEGORY_LABELS[booking.category as string] ?? 'job';
        const discountSms = appliedDiscountCents > 0 ? ' (€5 referral discount applied)' : '';
        const smsBody = directPay
          ? (payUrl && !booking.paid_at
              ? `VANO: ${helperFirstName} accepted your ${catSms}! Confirm with the ${feeStr} booking fee: ${payUrl} — you pay ${helperFirstName} ${jobStr} directly${payHelperHow} when the job's done.`
              : feeFree
                ? `VANO: ${helperFirstName} accepted your ${catSms} — no booking fee today 🎉 You pay ${helperFirstName} ${jobStr} directly${payHelperHow} when the job's done. Track: ${siteUrlSms}/track/${booking_id}`
                : feeCaptured
                  ? `VANO: ${helperFirstName} accepted your ${catSms}! You're confirmed — the ${feeStr} fee you reserved was charged. You pay ${helperFirstName} ${jobStr} directly${payHelperHow} when the job's done. Track: ${siteUrlSms}/track/${booking_id}`
                  : autoCharged
                    ? `VANO: ${helperFirstName} accepted your ${catSms}! The ${feeStr} booking fee went on your saved card. You pay ${helperFirstName} ${jobStr} directly${payHelperHow} when done. Track: ${siteUrlSms}/track/${booking_id}`
                    : `VANO: ${helperFirstName} accepted your ${catSms}! You pay ${helperFirstName} ${jobStr} directly${payHelperHow} when the job's done. Track: ${siteUrlSms}/track/${booking_id}`)
          : (payUrl && !booking.paid_at
              ? `VANO: ${helperFirstName} accepted your ${catSms} and is holding your slot — confirm & pay €${(totalCents / 100).toFixed(2)}${discountSms} securely: ${payUrl}`
              : autoCharged
                ? `VANO: ${helperFirstName} accepted your ${catSms}! €${(totalCents / 100).toFixed(2)} was charged to your saved card. Track here: ${siteUrlSms}/track/${booking_id}`
                : `VANO: ${helperFirstName} accepted your ${catSms}! Track here: ${siteUrlSms}/track/${booking_id}`);
        smsSent = await sendSms(phone, smsBody);
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

    const profileUrl  = helperId ? `${siteUrl}/helpers/${helperId}` : null;
    const ratingBits  = [
      helperRating ? `&#9733; ${Number(helperRating).toFixed(1)}` : null,
      helperJobs > 0 ? `${helperJobs} task${helperJobs === 1 ? '' : 's'} done` : null,
    ].filter(Boolean).join(' &middot; ');
    const helperCard = helperId ? `
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#eef3ef;border:1px solid #d5e2d8;border-radius:14px;margin:0 0 24px;">
      <tr>
        ${helperPhoto ? `<td style="padding:14px 0 14px 16px;width:64px;vertical-align:middle;"><img src="${helperPhoto}" alt="${helperFirstName}" width="52" height="52" style="border-radius:50%;object-fit:cover;display:block;" /></td>` : ''}
        <td style="padding:14px 16px;vertical-align:middle;">
          <p style="margin:0;color:#111827;font-size:15px;font-weight:700;">${helperFirstName}</p>
          ${ratingBits ? `<p style="margin:2px 0 0;color:#4b5563;font-size:13px;">${ratingBits}</p>` : ''}
          <p style="margin:4px 0 0;font-size:13px;"><a href="${profileUrl}" style="color:#4a7c59;font-weight:600;text-decoration:none;">View ${helperFirstName}'s profile &rarr;</a></p>
        </td>
      </tr>
    </table>` : '';

    const discountLine = appliedDiscountCents > 0
      ? `<p style="margin:0 0 14px;color:#4a7c59;font-size:13px;font-weight:600;">🎁 €${(appliedDiscountCents / 100).toFixed(0)} referral discount applied</p>`
      : '';

    const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:32px 32px 24px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">Helper confirmed</p>
    <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${helperFirstName} is on your job ✓</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;color:#111827;font-size:15px;">Hi ${custName},</p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      <strong>${helperFirstName}</strong> has accepted your <strong>${catLabel}</strong>${whenLine ? ' for <strong>' + whenLine + '</strong>' : ''}.
    </p>
    ${helperCard}
    ${directPay ? `
    <div style="background:#fffbf0;border:1px solid #f0e2be;border-radius:14px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#6b5b21;font-size:13px;line-height:1.6;"><strong>How payment works:</strong> you pay ${helperFirstName} <strong>€${(priceCents / 100).toFixed(2)} directly</strong>${helperPaymentHandle ? ` (Revolut <strong>${helperPaymentHandle}</strong> or cash)` : ' (Revolut or cash)'} when the job's done — they keep 100%. VANO only charges its booking fee.</p>
    </div>` : ''}
    ${payUrl && !booking.paid_at ? `
    <div style="background:#f6f8f6;border:1px solid #d5e2d8;border-radius:14px;padding:18px 20px;margin:0 0 24px;">
      <p style="margin:0 0 4px;color:#111827;font-size:15px;font-weight:700;">${directPay ? `Confirm your booking — €${(totalCents / 100).toFixed(2)} fee` : `Secure your booking — €${(totalCents / 100).toFixed(2)}`}</p>
      ${discountLine}
      <p style="margin:0 0 14px;color:#4b5563;font-size:13px;line-height:1.5;">${directPay
        ? `${helperFirstName} is holding your slot — the small booking fee confirms it${bookingData.cover_opted ? ' (includes your €2 Vano Cover)' : ''}. The job itself is paid to ${helperFirstName} directly after the work.`
        : `${helperFirstName} is holding your slot — pay securely by card to lock it in. No cash needed on the day.`}</p>
      <a href="${payUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:700;padding:13px 28px;border-radius:100px;text-decoration:none;">${directPay ? `Confirm booking — €${(totalCents / 100).toFixed(2)} fee` : `Confirm &amp; pay €${(totalCents / 100).toFixed(2)}`} →</a>
      <p style="margin:12px 0 0;color:#9ca3af;font-size:11px;line-height:1.5;">By paying you agree to VANO's <a href="${siteUrl}/terms" style="color:#9ca3af;">Terms</a> — the work is carried out by ${helperFirstName}, an independent provider${bookingData.cover_opted ? `, with <a href="${siteUrl}/cover" style="color:#9ca3af;">Vano Cover</a> up to €250 for accidental damage` : ''}.</p>
    </div>` : ''}
    ${directPay && feeFree ? `
    <div style="background:#f6f8f6;border:1px solid #d5e2d8;border-radius:14px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#2f4f3a;font-size:14px;font-weight:600;">🎉 Your booking fee is on us this time — you're all set.</p>
    </div>` : ''}
    ${directPay && feeCaptured ? `
    <div style="background:#f6f8f6;border:1px solid #d5e2d8;border-radius:14px;padding:14px 18px;margin:0 0 20px;">
      <p style="margin:0;color:#2f4f3a;font-size:14px;font-weight:600;">✓ You're confirmed — the €${(totalCents / 100).toFixed(2)} fee you reserved at booking was charged. Nothing else to pay VANO.</p>
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
            ? (directPay
                ? `${helperFirstName} accepted your ${catLabel} — confirm (€${(totalCents / 100).toFixed(2)} fee)`
                : `${helperFirstName} accepted your ${catLabel} — confirm & pay €${(totalCents / 100).toFixed(2)}`)
            : `${helperFirstName} is on your ${catLabel} — VANO`,
          html,
          text: `Hi ${custName}, ${helperFirstName} has accepted your ${catLabel}${whenLine ? ' for ' + whenLine : ''}.${payUrl && !booking.paid_at ? (directPay ? ` Confirm with the €${(totalCents / 100).toFixed(2)} booking fee: ${payUrl}.` : ` Confirm & pay €${(totalCents / 100).toFixed(2)}${appliedDiscountCents > 0 ? ' (€5 referral discount applied)' : ''} securely here: ${payUrl}.`) : ''}${directPay ? ` You pay ${helperFirstName} ${jobStr} directly${payHelperHow} when the job's done.` : ''} Track: ${trackUrl}. Ref: ${ref}`,
        }),
      });
      if (!res.ok) console.warn('[notify-household-accepted] Resend error', res.status, await res.text());
      emailedOk = res.ok;
    }

    const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim();
    if (adminEmail) {
      // The pay link reached the customer only if the text went out or they
      // gave an email that Resend accepted. If NEITHER happened on an unpaid
      // booking, the sale now depends on them reopening the track page — make
      // the admin alert unmissable so a human WhatsApps the link right away.
      const payLinkUndelivered = !!payUrl && !booking.paid_at && !smsSent && !emailedOk;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [adminEmail],
          subject: payLinkUndelivered
            ? `🚨 ACTION NEEDED — customer never got their pay link (${catLabel}, €${(totalCents / 100).toFixed(2)})`
            : `✅ Job claimed — ${helperFirstName} on ${catLabel}${booking.paid_at ? '' : ' (payment requested)'}`,
          text: [
            ...(payLinkUndelivered ? [
              `The customer has no email on file and the SMS/WhatsApp didn't go out — they have NOT received the pay link. WhatsApp it to them now:`,
              `${payUrl}`,
              '',
            ] : []),
            `${helperFirstName} just claimed a job.`,
            `Job: ${catLabel}`,
            `Customer: ${custName}`,
            `Phone: ${booking.customer_phone ?? '—'}`,
            `Email: ${booking.customer_email ?? '—'}`,
            `When: ${whenLine || 'Flexible'}`,
            directPay
              ? `Fee: ${booking.paid_at ? (feeFree ? 'WAIVED (loyalty/referral)' : feeCaptured ? `CAPTURED €${(totalCents / 100).toFixed(2)} (was reserved at booking)` : 'PAID') : `UNPAID — customer asked to confirm €${(totalCents / 100).toFixed(2)} fee${captureFailedHoldId ? ' (booking-time hold could not be captured — fell back to pay link)' : ''}`} · helper is paid ${jobStr} directly by the customer`
              : `Payment: ${booking.paid_at ? 'PAID' : `UNPAID — customer asked to pay €${(totalCents / 100).toFixed(2)}`}`,
            ...(appliedDiscountCents > 0 ? [`Referral discount applied: -€${(appliedDiscountCents / 100).toFixed(2)}`] : []),
            ...(payUrl && !booking.paid_at && !payLinkUndelivered ? [`Pay link (WhatsApp it to the customer if they have no email): ${payUrl}`] : []),
            `Ref: ${ref}`,
            `Track: ${trackUrl}`,
          ].join('\n'),
        }),
      }).catch(() => {});
    }

    return ok({ ok: true, emailed: emailedOk, sms_sent: smsSent, pay_url: payUrl, fee_captured: feeCaptured });
  } catch (err) {
    console.error('[notify-household-accepted] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
