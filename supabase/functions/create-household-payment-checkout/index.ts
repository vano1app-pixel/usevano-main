import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Server price table + category catalogue — shared with whatsapp-inbound so
// the WhatsApp door quotes exactly what this function charges.
import {
  VALID_CATEGORIES,
  type Category,
  computePriceCents,
  CATEGORY_LABELS,
} from "../_shared/householdPricing.ts";
// Free-text safety screen — shared pure module so the blocked lines are
// pinned by vitest (src/lib/__tests__/safetyScreen.test.ts).
import { screenRequestText } from "../_shared/safetyScreen.ts";
// Direct-pay fee maths (July 2026): Vano charges ONLY its booking fee (+ the
// optional €2 Vano Cover); the customer pays the student directly.
import { computeVanoFeeCents, VANO_COVER_CENTS, UNPAID_STRIKE_BLOCK_THRESHOLD } from "../_shared/vanoFees.ts";
// Auth-at-booking: the far-future gate (card holds die ~7 days, so bookings
// scheduled >5 days out keep pay-after-accept).
import { isFarFuture } from "../_shared/bookingMoney.ts";

// ── Inlined CORS ──────────────────────────────────────────────────────
const FALLBACK_ORIGINS = [
  'https://vanojobs.com', 'https://www.vanojobs.com',
  'http://localhost:5173', 'http://localhost:4173',
];
const ALLOWED_HEADERS = [
  'authorization','x-client-info','apikey','content-type',
  'x-supabase-client-platform','x-supabase-client-platform-version',
  'x-supabase-client-runtime','x-supabase-client-runtime-version',
].join(', ');
// The native apps load the SAME bundle from a local origin — iOS serves it
// from capacitor://localhost, Android from https://localhost (see
// capacitor.config.ts). These must ALWAYS pass the origin gate, even when the
// ALLOWED_ORIGINS secret overrides the fallback list, or every origin-gated
// call 403s inside the installed app.
const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost', 'ionic://localhost'];
function getAllowlist(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  const base = !raw
    ? FALLBACK_ORIGINS
    : raw.split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  return [...base, ...NATIVE_APP_ORIGINS];
}
function allowsVercelPreview(origin: string): boolean {
  try { return new URL(origin).hostname.endsWith('-vano1app-pixels-projects.vercel.app'); } catch { return false; }
}
function matchOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const n = origin.replace(/\/$/, '');
  if (getAllowlist().includes(n)) return n;
  if (allowsVercelPreview(n)) return n;
  return null;
}
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': matchOrigin(req) ?? 'null',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}
function isOriginAllowed(req: Request): boolean {
  if (!req.headers.get('Origin')) return true;
  return matchOrigin(req) !== null;
}
// ───────────────────────────────────────────────────────────────────────────────

// Public (no-auth) entry point for the CategoryGrid quick-booking flow.
// Validates inputs, prices the booking server-side (prevents client tampering),
// inserts an anonymous household_bookings row as status='pending' and
// dispatches it to helpers IMMEDIATELY — no upfront payment.
//
// Pay-after-accept: the customer is only asked to pay once a helper accepts
// (notify-household-accepted creates the Stripe Checkout session and emails
// the pay link). Paying for a named, confirmed person converts far better
// than paying a form — every booking under the old pay-first flow abandoned
// at checkout.
//
// Referral programme (give €5, get €5): an optional referral_code is
// validated here and the discount is RESERVED on the booking
// (booking_data.referral_* + a pending household_referrals row).
// notify-household-accepted applies it to the Stripe session as a coupon,
// and stripe-webhook flips the referral state when the payment lands.

// Same normalization as get-referral-code / stripe-webhook — referral rows
// are keyed on E.164 so "087 123 4567" and "+353871234567" are one customer.
function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
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

// (Category catalogue, computePriceCents and CATEGORY_LABELS now live in
// _shared/householdPricing.ts — imported above.)

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const bad = (status: number, error: string): Response =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!isOriginAllowed(req)) return bad(403, 'Forbidden origin');
  if (req.method !== 'POST') return bad(405, 'Method not allowed');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const { category, when_label, size_label, extra_label, scheduled, note, customer_name, customer_phone, customer_email, customer_address, customer_lat, customer_lng, city, referral_code, scheduled_at: scheduledAtRaw, cover } = body;
    // Optional Vano Cover add-on — customer-elected at booking, flat €2.
    const coverOpted = cover === true;

    // Book-ahead: the client computes the target time from the chosen slot (it
    // knows the local timezone). Validate it here — must be a real future time
    // within a sane window; anything else falls back to ASAP (null). NULL means
    // "as soon as possible", exactly as today.
    let scheduledAt: string | null = null;
    if (typeof scheduledAtRaw === 'string' && scheduledAtRaw) {
      const t = Date.parse(scheduledAtRaw);
      const now = Date.now();
      // Accept 20 min – 21 days ahead; ignore past/near-now (treat as ASAP) and
      // absurd far-future values.
      if (Number.isFinite(t) && t > now + 20 * 60 * 1000 && t < now + 21 * 24 * 60 * 60 * 1000) {
        scheduledAt = new Date(t).toISOString();
      }
    }

    if (!category || !VALID_CATEGORIES.includes(category as Category)) {
      return bad(400, 'Invalid category');
    }
    if (!customer_name?.trim()) return bad(400, 'customer_name is required');
    if (!customer_phone?.trim()) return bad(400, 'customer_phone is required');

    const cat = category as Category;
    const sl  = typeof size_label  === 'string' ? size_label  : '';
    const el  = typeof extra_label === 'string' ? extra_label : '';
    // "Scheduled" only counts when tied to a GENUINE future booking, not the
    // raw client `scheduled` flag — cross-check against scheduledAt (which is
    // independently validated to be 20min–21d in the future). No money rides
    // on this any more (the old 10% book-ahead price cut retired with
    // direct-pay); it's kept for dispatch timing + booking_data honesty.
    const isScheduled = scheduled === true && scheduledAt !== null;

    // ── Safety screen for free-text requests ─────────────────────────────
    // Patterns + rationale live in _shared/safetyScreen.ts (pure TS, pinned
    // by vitest). Anything the catalogue no longer offers — childminding,
    // eldercare, trades incl. plumbing, heights, driving passengers — is
    // refused here before it can be inserted or dispatched.
    const requestText = `${typeof note === 'string' ? note : ''} ${el}`.trim();
    if (requestText) {
      const refusalReason = screenRequestText(requestText);
      if (refusalReason) {
        console.warn(`[checkout] blocked unsafe request (${refusalReason}): "${requestText.slice(0, 120)}"`);
        return bad(422,
          `Sorry — this looks like ${refusalReason}, which VANO can't take on. ` +
          `Our helpers are ID-verified students, not Garda-vetted carers or qualified tradespeople. ` +
          `If we've read your request wrong, WhatsApp us on +353 89 981 7111 and a person will sort it.`);
      }
    }

    const priceCents = computePriceCents(cat, sl, el);
    if (!priceCents) {
      return bad(400, `No price available for ${category} / ${sl}${el ? ' / ' + el : ''}`);
    }
    const isMonthlyPlan = cat.startsWith('airbnb-');

    // ── DIRECT-PAY MODEL (July 2026) ─────────────────────────────────────
    // The job price is the STUDENT'S money, paid to them directly by the
    // customer (Revolut / cash) — Vano never holds it, never discounts it,
    // and the student keeps 100% (trivially above the €14.15/hr wage floor).
    // Vano's card charge at accept is ONLY:
    //   vano_fee_cents  — 15% of the job price, min €4 (_shared/vanoFees.ts)
    //   cover_cents     — the optional €2 Vano Cover add-on
    // All discounts (loyalty / referral) now apply to VANO'S FEE, never the
    // student's money. The old book-ahead 10% price cut is gone for the same
    // reason — Vano can't discount money it doesn't collect.
    // (Airbnb monthly plans are parked with no UI door; they ride the same
    // fee-only path — decide their billing if they're ever relaunched.)
    const vanoFeeCents = computeVanoFeeCents(priceCents);
    const coverCents = coverOpted ? VANO_COVER_CENTS : 0;

    const supabase = createClient(supabaseUrl, serviceKey);
    let isLoyalty = false;
    if (!isMonthlyPlan) {
      // Every 3rd booking: the VANO FEE is on us (the student's money is
      // untouched — it was never ours to discount). Only PAID bookings count,
      // so spam bookings can't farm the freebie.
      const { count: loyaltyCount } = await supabase
        .from('household_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('customer_phone', customer_phone.trim())
        .not('paid_at', 'is', null)
        .neq('status', 'cancelled');
      const confirmedCount = loyaltyCount ?? 0;
      isLoyalty = (confirmedCount + 1) % 3 === 0;
    }

    // ── Referral programme (give €5, get €5) ──────────────────────────────
    // Two mutually exclusive discounts, at most one per booking:
    //   welcome — first-ever booking arriving through a friend's ?ref link
    //   redeem  — referrer spending a credit a friend earned them
    // Direct-pay: the credit now comes off VANO'S FEE (usually making it
    // free), never the student's money. Validated here, reserved on the
    // booking, applied by notify-household-accepted. Best-effort: any error
    // zeroes the discount and the booking proceeds at the normal fee.
    // NOT stacked with the loyalty fee-waiver — on a loyalty booking the fee
    // is already free, so the customer keeps their €5 credit for next time.
    const normalizedPhone = normalizeE164(customer_phone);

    // ── Unpaid-strike guard (two-way reviews) ─────────────────────────────
    // Direct-pay means a customer *could* stiff a student — so helpers report
    // "didn't pay me" (household_customer_ratings.paid = false) and a phone
    // with UNPAID_STRIKE_BLOCK_THRESHOLD strikes can't book online until the
    // owner clears it. Checked against both stored phone forms.
    const phoneFormsForRep = [...new Set([customer_phone.trim(), normalizedPhone].filter(Boolean))] as string[];
    let unpaidStrikes = 0;
    let repPaidJobs = 0;
    let repStars: number | null = null;
    try {
      const { data: repRows } = await supabase
        .from('household_customer_ratings')
        .select('paid, rating')
        .in('customer_phone', phoneFormsForRep);
      for (const r of (repRows ?? []) as Array<{ paid: boolean; rating: number | null }>) {
        if (r.paid === false) unpaidStrikes += 1;
        else repPaidJobs += 1;
      }
      const stars = ((repRows ?? []) as Array<{ rating: number | null }>).map(r => r.rating).filter((n): n is number => typeof n === 'number');
      if (stars.length > 0) repStars = Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10;
    } catch (e) {
      console.warn('[create-household-payment-checkout] customer-rep lookup skipped', e);
    }
    if (unpaidStrikes >= UNPAID_STRIKE_BLOCK_THRESHOLD) {
      console.warn(`[checkout] blocked booking from ${normalizedPhone ?? customer_phone} — ${unpaidStrikes} unpaid strikes`);
      return bad(422,
        'We can\'t take this booking online — helpers have reported unpaid jobs on this number. ' +
        'Message us on WhatsApp (+353 89 981 7111) and a person will sort it out.');
    }
    let referralWelcome: { code: string; referrerPhone: string } | null = null;
    let redeemRow: { id: string; credit_cents: number } | null = null;

    if (!isMonthlyPlan && !isLoyalty && normalizedPhone) {
      try {
        const rawRef = typeof referral_code === 'string' ? referral_code.trim().toUpperCase() : '';
        if (rawRef && /^[A-Z0-9]{4,12}$/.test(rawRef)) {
          const { data: codeRow } = await supabase
            .from('household_referral_codes')
            .select('code, phone')
            .eq('code', rawRef)
            .maybeSingle();
          if (codeRow && (codeRow.phone as string) !== normalizedPhone) {
            const phoneForms = [...new Set([customer_phone.trim(), normalizedPhone])];
            const { count: paidBookings } = await supabase
              .from('household_bookings')
              .select('id', { count: 'exact', head: true })
              .in('customer_phone', phoneForms)
              .not('paid_at', 'is', null);
            const { data: priorReferral } = await supabase
              .from('household_referrals')
              .select('id')
              .eq('referee_phone', normalizedPhone)
              .maybeSingle();
            if ((paidBookings ?? 0) === 0 && !priorReferral) {
              referralWelcome = { code: codeRow.code as string, referrerPhone: codeRow.phone as string };
            }
          }
        }
        if (!referralWelcome) {
          const { data: earned } = await supabase
            .from('household_referrals')
            .select('id, credit_cents')
            .eq('referrer_phone', normalizedPhone)
            .eq('status', 'earned')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          if (earned) redeemRow = { id: earned.id as string, credit_cents: (earned.credit_cents as number) ?? 500 };
        }
      } catch (e) {
        console.warn('[create-household-payment-checkout] referral lookup skipped', e);
        referralWelcome = null;
        redeemRow = null;
      }
    }

    // Referral credit comes off the FEE only (the cover €2 funds the damage
    // pot — never discounted). Loyalty already waives the whole fee.
    const feeAfterLoyalty = isLoyalty ? 0 : vanoFeeCents;
    let referralDiscountCents = referralWelcome ? 500 : redeemRow ? Math.min(redeemRow.credit_cents, 500) : 0;
    referralDiscountCents = Math.min(referralDiscountCents, feeAfterLoyalty);
    if (referralDiscountCents <= 0) {
      referralDiscountCents = 0;
      referralWelcome = null;
      redeemRow = null;
    }
    // What the customer's card is actually charged at accept. Can be €0
    // (loyalty / referral covers the fee, no cover) — notify-household-
    // accepted then skips Stripe entirely and marks the booking confirmed.
    const feeDueCents = Math.max(0, feeAfterLoyalty - referralDiscountCents) + coverCents;

    // ── AUTH-AT-BOOKING (behind VANO_AUTH_AT_BOOKING) ────────────────────
    // Fee-carrying, near-term bookings are born `awaiting_payment` behind a
    // manual-capture Stripe Checkout (Apple Pay/Google Pay/card): the fee is
    // RESERVED on the card now and only CAPTURED when a helper accepts — so
    // "no payment until a helper accepts" stays literally true while
    // time-wasters filter out before dispatch. Excluded (→ classic born-
    // pending pay-after-accept): fee-free bookings (nothing to hold),
    // far-future ones (>5 days — card holds die at ~7), sub-minimum amounts
    // (Stripe won't authorize < €0.50 — possible when a referral leaves a
    // tiny fee remainder), and any run without a Stripe key.
    const stripeKeyForAuth = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
    const authPath =
      Deno.env.get('VANO_AUTH_AT_BOOKING') === '1' &&
      !!stripeKeyForAuth &&
      feeDueCents >= 50 &&
      !isMonthlyPlan &&
      !isFarFuture(scheduledAt, Date.now());

    // booking_data is built once and (only for welcome referrals) updated in
    // place after the referral row insert supplies its id.
    const bookingData: Record<string, unknown> = {
      when_label:    when_label || null,
      size_label:    sl || null,
      extra_label:   el || null,
      scheduled:     isScheduled,
      loyalty:       isLoyalty,
      note:          typeof note === 'string' ? note.trim() : null,
      source:        'task_showcase',
      // ── Direct-pay money picture ──
      direct_pay:        true,
      job_price_cents:   priceCents,     // the student's money, paid directly
      vano_fee_cents:    vanoFeeCents,   // 15% min €4 — before discounts
      fee_due_cents:     feeDueCents,    // what the card is charged at accept
      cover_opted:       coverOpted,
      cover_cents:       coverCents,
      ...(isLoyalty ? { fee_waived_loyalty: true } : {}),
      // Customer reputation snapshot for the helper's accept decision
      // ("pays promptly ✓ · 3 jobs" / "New customer") — no PII beyond what
      // the assigned helper sees anyway.
      customer_rep: { paid_jobs: repPaidJobs, unpaid_reports: unpaidStrikes, ...(repStars != null ? { stars: repStars } : {}) },
      ...(referralDiscountCents > 0 ? {
        referral_discount_cents: referralDiscountCents,
        referral_kind: referralWelcome ? 'welcome' : 'redeem',
        ...(redeemRow ? { redeem_referral_id: redeemRow.id } : {}),
      } : {}),
      // Auth-at-booking marker: this row was born awaiting_payment behind a
      // manual-capture hold (distinguishes it from legacy awaiting_payment).
      ...(authPath ? { fee_auth_required: true } : {}),
    };

    // Resolve the address once, and geocode server-side when the client didn't
    // supply coordinates (e.g. the customer typed the address), so the tracking
    // map has a location to show. Best-effort — never blocks the booking.
    const resolvedAddress =
      typeof customer_address === 'string' && customer_address.trim() ? customer_address.trim()
      : typeof note === 'string' && note.trim() ? note.trim()
      : 'Not provided';
    let custLat = typeof customer_lat === 'number' && isFinite(customer_lat) ? customer_lat : null;
    let custLng = typeof customer_lng === 'number' && isFinite(customer_lng) ? customer_lng : null;
    if ((custLat === null || custLng === null) && resolvedAddress !== 'Not provided') {
      try {
        const q = [resolvedAddress, typeof city === 'string' ? city : null, 'Ireland'].filter(Boolean).join(', ');
        const geoResp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ie&q=${encodeURIComponent(q)}`,
          { headers: { 'User-Agent': 'VANO/1.0 (vanojobs.com)' } },
        );
        if (geoResp.ok) {
          const hits = await geoResp.json().catch(() => []);
          const hit = Array.isArray(hits) ? hits[0] : null;
          const lat = hit ? parseFloat(hit.lat) : NaN;
          const lng = hit ? parseFloat(hit.lon) : NaN;
          if (isFinite(lat) && isFinite(lng)) { custLat = lat; custLng = lng; }
        }
      } catch (e) { console.warn('[create-household-payment-checkout] geocode failed', e); }
    }

    // Double-submit guard: a fast double-tap on Book (or a retry) can call this
    // twice before the client disables the button. If the same phone already
    // created a live booking for the same category in the last few minutes,
    // return THAT booking instead of creating a second one (which would fan out
    // a second dispatch and could charge the customer twice).
    {
      const dedupeCutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: recent } = await supabase
        .from('household_bookings')
        .select('id, booking_data, status, stripe_checkout_url')
        .eq('customer_phone', customer_phone.trim())
        .eq('category', cat)
        // Same requested time too — otherwise a customer booking "Cleaning now"
        // then "Cleaning tomorrow 9am" would have the second silently swallowed.
        .eq('scheduled_date', when_label || 'flexible')
        .not('status', 'in', '(cancelled,completed)')
        .gte('created_at', dedupeCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle() as { data: { id: string; booking_data: Record<string, unknown> | null; status?: string; stripe_checkout_url?: string | null } | null };
      // Same size AND same note AND same extra_label — a genuine double-tap
      // repeats every field; a DIFFERENT job changes one. Without note/extra:
      //  • custom jobs (category 'custom', note = the actual description) would
      //    collide — "walk my dog / 1 hour" then "assemble a desk / 1 hour"
      //    both look identical and the desk booking would be silently dropped;
      //  • tutoring bookings price on extra_label (the duration), so
      //    "Leaving Cert / 1 hour" vs "/ 3 hours" would collide too.
      const recentBd = (recent?.booking_data as Record<string, unknown> | null) ?? {};
      const recentSize  = (recentBd.size_label as string | null) ?? null;
      const recentNote  = (recentBd.note as string | null) ?? null;
      const recentExtra = (recentBd.extra_label as string | null) ?? null;
      const thisNote = typeof note === 'string' ? note.trim() : null;
      const sameJob = !!recent?.id
        && (recentSize ?? null) === (sl || null)
        && (recentExtra ?? null) === (el || null)
        && (recentNote ?? null) === (thisNote || null);
      if (recent?.id && sameJob) {
        console.log('[create-household-payment-checkout] duplicate submit — returning existing booking', recent.id);
        const origin0 = req.headers.get('origin') || Deno.env.get('SITE_URL') || 'https://vanojobs.com';
        const trackUrl0 = `${origin0}/track/${recent.id}`;
        const bd0 = recent.booking_data as Record<string, unknown> | null;
        // Quote the EXISTING booking's numbers, not this request's re-priced
        // ones — they're the amounts that booking will actually use.
        const jobCents0 = Number(bd0?.job_price_cents) || priceCents;
        const feeDue0 = Number(bd0?.fee_due_cents ?? feeDueCents) || 0;
        // Auth-at-booking dedupe: an awaiting_payment twin still needs its
        // card step — hand back its EXISTING Stripe session, not the track
        // URL, or a double-tap would strand the customer on a booking that
        // never authorizes and never dispatches.
        const isAwaitingAuth = recent.status === 'awaiting_payment' && !!recent.stripe_checkout_url;
        return new Response(
          JSON.stringify({
            booking_id: recent.id,
            track_url: trackUrl0,
            checkout_url: isAwaitingAuth ? recent.stripe_checkout_url : trackUrl0,
            ...(isAwaitingAuth ? { auth_required: true } : {}),
            price_cents: jobCents0,
            fee_due_cents: feeDue0,
            total_cents: jobCents0 + feeDue0,
            pay_later: true,
            deduped: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const { data: booking, error: insertError } = await supabase
      .from('household_bookings')
      .insert({
        customer_id: null,
        category: cat,
        scheduled_date: when_label || 'flexible',
        time_slot: null,
        is_express: false,
        price_estimate_cents: priceCents,
        // Auth path: born awaiting_payment — the auth webhook flips it live
        // (pending) once the card hold succeeds. Classic path: live
        // immediately, payment requested after a helper accepts.
        status: authPath ? 'awaiting_payment' : 'pending',
        customer_name: customer_name.trim(),
        // Prefer the dedicated address field (quick-book sheet sends it);
        // fall back to the legacy note-as-address behaviour.
        customer_address: resolvedAddress,
        ...(custLat !== null && custLng !== null ? { customer_lat: custLat, customer_lng: custLng } : {}),
        ...(typeof city === 'string' && city.trim() ? { city: city.trim() } : {}),
        customer_phone: customer_phone.trim(),
        ...(typeof customer_email === 'string' && customer_email.trim() ? { customer_email: customer_email.trim().toLowerCase() } : {}),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        booking_data: bookingData,
      })
      .select('id')
      .single();

    if (insertError || !booking) {
      console.error('[create-household-payment-checkout] insert failed', insertError);
      return bad(500, 'Could not create booking. Please try again.');
    }

    const bookingId: string = booking.id;
    const origin =
      req.headers.get('origin') ||
      Deno.env.get('SITE_URL') ||
      'https://vanojobs.com';
    const trackUrl = `${origin}/track/${bookingId}`;
    const cityVal = typeof city === 'string' && city.trim() ? city.trim() : null;

    // Home memory: refresh this phone's household_homes row — the server-side
    // "the home is the account" record whatsapp-inbound reads for welcome-back
    // greetings, saved-address reuse and "same again?". Strictly fail-soft:
    // memory must never break a booking (e.g. before the migration is applied).
    try {
      const { error: homeErr } = await supabase.rpc('record_home_booking', {
        p_phone: normalizedPhone ?? customer_phone.trim(),
        p_name: customer_name.trim(),
        p_address: resolvedAddress !== 'Not provided' ? resolvedAddress : '',
        p_lat: custLat,
        p_lng: custLng,
        p_city: cityVal ?? '',
        p_email: typeof customer_email === 'string' ? customer_email.trim().toLowerCase() : '',
        p_category: cat,
        p_size_label: sl || '',
        p_booking_id: bookingId,
      });
      if (homeErr) console.warn('[create-household-payment-checkout] home memory stamp failed', homeErr);
    } catch (e) {
      console.warn('[create-household-payment-checkout] home memory stamp threw', e);
    }

    // Reserve the welcome referral now that the booking id exists. If this
    // fails the discount is dropped from booking_data so the pay link stays
    // honest — never block the booking itself.
    if (referralWelcome && normalizedPhone && referralDiscountCents > 0) {
      let welcomeId: string | null = null;
      try {
        const { data: refRow, error: refErr } = await supabase
          .from('household_referrals')
          .insert({
            code: referralWelcome.code,
            referrer_phone: referralWelcome.referrerPhone,
            referee_phone: normalizedPhone,
            referee_booking_id: bookingId,
            credit_cents: 500,
            status: 'pending',
          })
          .select('id')
          .single();
        if (refErr) console.warn('[create-household-payment-checkout] referral row insert failed', refErr);
        welcomeId = (refRow?.id as string | undefined) ?? null;
      } catch (e) {
        console.warn('[create-household-payment-checkout] referral row insert threw', e);
      }
      try {
        if (welcomeId) {
          bookingData.referral_welcome_id = welcomeId;
        } else {
          referralDiscountCents = 0;
          delete bookingData.referral_discount_cents;
          delete bookingData.referral_kind;
        }
        await supabase
          .from('household_bookings')
          .update({ booking_data: bookingData })
          .eq('id', bookingId);
      } catch (e) {
        console.warn('[create-household-payment-checkout] booking_data referral stamp failed', e);
      }
    }

    // Reserve the REDEEM credit atomically now that the booking id exists.
    // The redeem lookup above only READ status='earned' without locking it, so
    // a referrer with one €5 credit who books twice in the unpaid window would
    // otherwise get €10 off a single credit (both reads see 'earned'; the
    // second webhook flip is a no-op but both coupons already minted). CAS the
    // earned row's redeemed_booking_id to THIS booking (guarded on it still
    // being null + earned); if we lose the race, drop the discount from this
    // booking so its pay link stays honest. The stripe-webhook earned→redeemed
    // flip stays correct — only the winning booking keeps the reservation.
    if (redeemRow && normalizedPhone && referralDiscountCents > 0) {
      let reserved = false;
      try {
        const { data: claimedCredit } = await supabase
          .from('household_referrals')
          .update({ redeemed_booking_id: bookingId })
          .eq('id', redeemRow.id)
          .eq('status', 'earned')
          .is('redeemed_booking_id', null)
          .select('id')
          .maybeSingle();
        reserved = !!claimedCredit;
      } catch (e) {
        console.warn('[create-household-payment-checkout] redeem reserve threw', e);
      }
      if (!reserved) {
        referralDiscountCents = 0;
        delete bookingData.referral_discount_cents;
        delete bookingData.referral_kind;
        delete bookingData.redeem_referral_id;
        try {
          await supabase.from('household_bookings').update({ booking_data: bookingData }).eq('id', bookingId);
        } catch (e) {
          console.warn('[create-household-payment-checkout] redeem discount strip failed', e);
        }
      }
    }

    // ── Auth path: mint the manual-capture Checkout session ─────────────
    // The card step happens NOW (Apple Pay/Google Pay/card), but the money is
    // only captured when a helper accepts. The booking sits at
    // awaiting_payment until the auth webhook flips it live and dispatches.
    // FAIL-OPEN: if Stripe hiccups here, the booking must not die — flip it
    // straight to pending and continue down the classic dispatch path.
    let authSessionUrl: string | null = null;
    let authActive = authPath;
    if (authPath) {
      try {
        const stripeApiBase = (Deno.env.get('STRIPE_API_BASE') ?? 'https://api.stripe.com').replace(/\/$/, '');
        const feePartCents = feeDueCents - coverCents;
        const catLabel = CATEGORY_LABELS[cat];
        const params = new URLSearchParams({
          mode: 'payment',
          'payment_intent_data[capture_method]': 'manual',
          'payment_intent_data[metadata][household_booking_id]': bookingId,
          // Save the card for future one-tap bookings (composes with manual capture)
          customer_creation: 'always',
          'payment_intent_data[setup_future_usage]': 'off_session',
          success_url: `${origin}/track/${bookingId}?authorized=true`,
          cancel_url: `${origin}/track/${bookingId}`,
          'metadata[household_booking_id]': bookingId,
          'metadata[vano_fee_auth]': '1',
          client_reference_id: bookingId,
          // Abandoned checkouts expire in 60 min (Stripe min is 30) →
          // checkout.session.expired quietly cancels the booking.
          expires_at: String(Math.floor(Date.now() / 1000) + 3600),
        });
        let li = 0;
        if (feePartCents > 0) {
          params.set(`line_items[${li}][quantity]`, '1');
          params.set(`line_items[${li}][price_data][currency]`, 'eur');
          params.set(`line_items[${li}][price_data][unit_amount]`, String(feePartCents));
          params.set(`line_items[${li}][price_data][product_data][name]`, 'VANO booking fee');
          params.set(`line_items[${li}][price_data][product_data][description]`,
            `Matching, ID verification & support for your ${catLabel}. Reserved now — only charged when a helper accepts. The job itself (€${(priceCents / 100).toFixed(2)}) is paid to your helper directly.`);
          li += 1;
        }
        if (coverCents > 0) {
          params.set(`line_items[${li}][quantity]`, '1');
          params.set(`line_items[${li}][price_data][currency]`, 'eur');
          params.set(`line_items[${li}][price_data][unit_amount]`, String(coverCents));
          params.set(`line_items[${li}][price_data][product_data][name]`, 'Vano Cover — accidental damage up to €250');
          li += 1;
        }
        if (typeof customer_email === 'string' && customer_email.trim()) {
          // Receipt sends on CAPTURE (accept time) — exactly when money moves.
          params.set('payment_intent_data[receipt_email]', customer_email.trim().toLowerCase());
        }
        const sessResp = await fetch(`${stripeApiBase}/v1/checkout/sessions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeKeyForAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Idempotency-Key': `vano_fee_auth_session_${bookingId}`,
          },
          body: params.toString(),
        });
        const sess = sessResp.ok ? await sessResp.json() as { id?: string; url?: string } : null;
        if (sess?.url && sess?.id) {
          authSessionUrl = sess.url;
          await supabase
            .from('household_bookings')
            .update({
              stripe_checkout_url: sess.url,
              // cs_… while the session is open; the auth webhook overwrites
              // with the real pi_. payment_requested_at stays NULL — it is
              // strictly the post-accept pay-link clock.
              stripe_payment_intent_id: sess.id,
            })
            .eq('id', bookingId);
        } else {
          const errText = sessResp.ok ? 'malformed session' : `${sessResp.status} ${(await sessResp.text().catch(() => '')).slice(0, 200)}`;
          throw new Error(errText);
        }
      } catch (e) {
        console.error('[create-household-payment-checkout] auth session failed — failing open to pay-after-accept', e);
        authActive = false;
        authSessionUrl = null;
        delete bookingData.fee_auth_required;
        bookingData.fee_auth_skipped = 'stripe_error';
        await supabase
          .from('household_bookings')
          .update({ status: 'pending', booking_data: bookingData })
          .eq('id', bookingId)
          .eq('status', 'awaiting_payment');
      }
    }

    // Dispatch to helpers. ASAP jobs (no scheduled_at) and near-term ones go out
    // now — that's what makes the booking real. A genuinely future-dated job is
    // NOT dispatched yet: the dispatch-scheduled-jobs cron fans it out once it's
    // within the lead window, so helpers aren't offered a job days early (and it
    // isn't auto-cancelled before it's due). LEAD_MIN mirrors that cron.
    // Auth path: dispatch is DEFERRED to the auth webhook — helpers only ever
    // see fee-secured jobs.
    const LEAD_MIN = 90;
    const dispatchNow = !authActive && (!scheduledAt || (Date.parse(scheduledAt) - Date.now()) <= LEAD_MIN * 60 * 1000);
    if (dispatchNow) {
      try {
        const dispatchResp = await fetch(`${supabaseUrl}/functions/v1/dispatch-household-job`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            record: {
              id: bookingId, status: 'pending', city: cityVal,
              category: cat, scheduled_date: when_label || 'flexible',
              price_estimate_cents: priceCents,
            },
          }),
        });
        if (!dispatchResp.ok) {
          console.error('[create-household-payment-checkout] dispatch non-2xx', dispatchResp.status, await dispatchResp.text().catch(() => ''));
        }
      } catch (e) {
        console.error('[create-household-payment-checkout] dispatch call failed', e);
      }
    } else if (authActive) {
      console.log('[create-household-payment-checkout] auth-at-booking — dispatch deferred to the fee-auth webhook', { bookingId });
    } else {
      console.log('[create-household-payment-checkout] future-dated booking — deferring dispatch to lead window', { bookingId, scheduledAt });
    }

    // Admin ping (WhatsApp + email) — used to fire from stripe-webhook on
    // payment, but payment now happens after acceptance, so notify here.
    const adminNotifyPromise = (async () => {
      const priceStr = `€${(priceCents / 100).toFixed(2)} to helper + €${(feeDueCents / 100).toFixed(2)} fee`;
      const ref = bookingId.slice(-8).toUpperCase();
      const catLabel = CATEGORY_LABELS[cat];
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'new_booking',
            customer_name: customer_name.trim(),
            customer_phone: customer_phone.trim(),
            customer_email: typeof customer_email === 'string' ? customer_email.trim() : null,
            category: cat,
            scheduled_date: when_label || 'flexible',
            city: cityVal,
            price_euros: (priceCents / 100).toFixed(2),
            booking_id: bookingId,
          }),
        });
      } catch (e) {
        console.warn('[create-household-payment-checkout] admin whatsapp error', e);
      }
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY')?.trim();
        const adminEmail = Deno.env.get('ADMIN_EMAIL')?.trim() || 'vano1app@gmail.com';
        if (!resendKey) return;
        const resendFrom = Deno.env.get('RESEND_FROM')?.trim() || 'VANO <onboarding@resend.dev>';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: resendFrom,
            to: [adminEmail],
            subject: `🆕 New booking — ${catLabel} in ${cityVal ?? '?'} (${priceStr})`,
            text: [
              'New booking (direct-pay: Vano charges its fee on accept; the customer pays the helper directly).',
              `Job: ${catLabel}`,
              ...(typeof note === 'string' && note.trim() ? [`Details: ${note.trim()}`] : []),
              `Customer: ${customer_name.trim()}`,
              `Phone: ${customer_phone.trim()}`,
              `City: ${cityVal ?? '—'}`,
              `When: ${when_label || 'Flexible'}`,
              `Helper gets (paid directly): €${(priceCents / 100).toFixed(2)}`,
              `Vano fee: €${(feeDueCents / 100).toFixed(2)}${coverOpted ? ' (incl. €2 Vano Cover)' : ''}${isLoyalty ? ' (loyalty: fee waived)' : ''}${authActive ? ' — RESERVED at booking (card hold), captured on accept' : ' — charged on accept'}`,
              ...(unpaidStrikes > 0 ? [`⚠ Customer has ${unpaidStrikes} unpaid strike(s)`] : []),
              ...(referralDiscountCents > 0 ? [`Referral credit applied to fee: -€${(referralDiscountCents / 100).toFixed(2)}`] : []),
              `Ref: ${ref}`,
              `Track: ${trackUrl}`,
            ].join('\n'),
          }),
        });
      } catch (e) {
        console.warn('[create-household-payment-checkout] admin email error', e);
      }
    })();

    const runtime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(adminNotifyPromise);
    else adminNotifyPromise.catch(() => {});

    // Auth path: checkout_url is the Stripe session — the sheet hard-redirects
    // external URLs, so the customer lands straight on the Apple Pay/card step.
    // Classic path: checkout_url intentionally mirrors track_url (frontends
    // built before pay-after-accept redirect to checkout_url, and the track
    // page is the correct destination there).
    return new Response(
      JSON.stringify({
        booking_id: bookingId,
        track_url: trackUrl,
        checkout_url: authActive && authSessionUrl ? authSessionUrl : trackUrl,
        ...(authActive && authSessionUrl ? { auth_required: true } : {}),
        price_cents: priceCents,
        fee_due_cents: feeDueCents,
        total_cents: priceCents + feeDueCents,
        ...(referralDiscountCents > 0 ? { referral_discount_cents: referralDiscountCents } : {}),
        pay_later: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[create-household-payment-checkout] unhandled', err);
    return bad(500, 'Unexpected error');
  }
});
