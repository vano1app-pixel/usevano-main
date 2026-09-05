import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signAcceptToken } from "../_shared/acceptToken.ts";
import { isCatchAllCategory } from "../_shared/helperMatch.ts";
// Neighbourhood label for the OFFER — a helper decides on the trip, and the
// exact address is theirs only after they claim (owner call 2026-07-30).
import { approxAreaLabel } from "../_shared/serviceAreas.ts";
import { durationText } from "../_shared/householdJob.ts";
// Kit matching — a booking that needs a mower only reaches helpers who own one.
import { KIT_HIRE_CENTS, kitLabel, normalizeKit } from "../_shared/kit.ts";

// Triggered by create-household-payment-checkout when a booking goes live,
// and by the redispatch-stale-jobs cron when all offers have expired.
//
// Dispatch priority:
//   1. Helpers in the same city with matching category (up to MAX_OFFERS).
//   2. If none found → fall back to ALL helpers on the platform with matching category.
//   3. If still none → email customer "we're on it, WhatsApp us if urgent" (NO auto-refund).
//
// Notification channels per helper: web push (instant, pocket), WhatsApp and
// SMS via Twilio (independent — both fire when configured), and email. Pocket
// channels (push + WhatsApp + SMS) re-fire on every re-dispatch round so a
// missed offer is chased down; only the repeat email is suppressed.
//
// Re-dispatch safety: stale pending offers (past expires_at) are expired first
// so the idempotency check doesn't block re-runs after the TTL window — and
// the offer upsert UPDATES existing (booking_id, helper_id) rows back to a
// live pending state. (It previously used ignoreDuplicates, which meant a
// re-dispatch could never revive an expired offer: ON CONFLICT DO NOTHING
// left every offer dead and jobs quietly stranded.)

// Fan out to everyone matching, not just a handful — first to accept wins, so
// wider reach = faster claims. Capped only as a runaway safety valve.
const MAX_OFFERS = Number(Deno.env.get('DISPATCH_MAX_OFFERS')) || 50;
// Helpers are notified by email only, and every offer sent so far expired
// unaccepted at the old 20-minute TTL — students simply don't see email that
// fast. 60 min keeps urgency but gives a realistic window, and still fits
// inside no-helper-fallback's 2-hour auto-refund cutoff.
const OFFER_TTL_MINUTES = 60;

// Gap-recruit nudges (see sendGapRecruitNudges): only fire when coverage is
// thin — if plenty of matching helpers already got the offer there's no gap
// to recruit into, and texting bystanders would just burn goodwill.
const GAP_NUDGE_MIN_COVERAGE = 5;   // nudge only when fewer matching helpers than this were offered
const GAP_NUDGE_MAX_RECIPIENTS = 5; // per dispatch
const GAP_NUDGE_COOLDOWN_DAYS = 7;  // per helper, across all categories

const CATEGORY_LABELS: Record<string, string> = {
  business: 'Business temp staff',
  shopping: 'Laundry',
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

// "€54" not "€54.00" — drop the cents when they're zero, everywhere the offer
// shows money (subject, push, WhatsApp/SMS, email). Cleaner and easier to scan.
function fmtEuro(cents: number): string {
  const eur = cents / 100;
  return Number.isInteger(eur) ? `€${eur}` : `€${eur.toFixed(2)}`;
}

// scheduled_date stores the human "when" label from the quick sheet — 'Now',
// '1pm', 'Tomorrow 9am', 'flexible' (or null). Make it read like a person
// wrote it: helpers decide fast when the when is unambiguous.
function friendlyWhen(sd: string | null): string {
  const s = (sd ?? '').trim();
  if (!s || /^(now|asap|flexible)$/i.test(s)) return 'ASAP — as soon as you accept';
  if (/^\d{1,2}(:\d{2})?\s*(am|pm)$/i.test(s)) return `Today at ${s}`;
  return s;
}

// The customer's own words (booking_data.note) ride into the offer — escape
// them before they touch HTML.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Web push (raw VAPID + aes128gcm, same implementation as notify-new-message) ──
function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createVapidJwt(
  endpoint: string,
  publicKey: string,
  privateKey: string,
  subject: string,
): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 86400, sub: subject };

  const headerB64 = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const keyData = base64UrlToArrayBuffer(privateKey);
  let cryptoKey: CryptoKey;
  try {
    const rawKey = new Uint8Array(keyData);
    if (rawKey.length === 32) {
      const pubKeyRaw = base64UrlToArrayBuffer(publicKey);
      const pubKeyBytes = new Uint8Array(pubKeyRaw);
      const x = arrayBufferToBase64Url(pubKeyBytes.slice(1, 33));
      const y = arrayBufferToBase64Url(pubKeyBytes.slice(33, 65));
      const d = arrayBufferToBase64Url(rawKey);
      cryptoKey = await crypto.subtle.importKey(
        "jwk",
        { kty: "EC", crv: "P-256", x, y, d },
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
    } else {
      cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    }
  } catch {
    cryptoKey = await crypto.subtle.importKey("pkcs8", keyData, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  } else {
    let offset = 2;
    const rLen = sigBytes[offset + 1];
    r = sigBytes.slice(offset + 2, offset + 2 + rLen);
    offset = offset + 2 + rLen;
    const sLen = sigBytes[offset + 1];
    s = sigBytes.slice(offset + 2, offset + 2 + sLen);
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) r = new Uint8Array([...new Uint8Array(32 - r.length), ...r]);
    if (s.length < 32) s = new Uint8Array([...new Uint8Array(32 - s.length), ...s]);
  }

  const rawSig = new Uint8Array([...r, ...s]);
  return `${unsignedToken}.${arrayBufferToBase64Url(rawSig)}`;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<boolean> {
  try {
    const localKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
    );

    const subscriberPubKey = await crypto.subtle.importKey(
      "raw", base64UrlToArrayBuffer(subscription.p256dh),
      { name: "ECDH", namedCurve: "P-256" }, false, []
    );

    const sharedSecret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberPubKey }, localKeyPair.privateKey, 256
    );

    const authSecret = base64UrlToArrayBuffer(subscription.auth);
    const localPubKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
    const encoder = new TextEncoder();

    const prkKey = await crypto.subtle.importKey("raw", authSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const prk = await crypto.subtle.sign("HMAC", prkKey, sharedSecret);

    const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
    const cekHmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const cekBits = await crypto.subtle.sign("HMAC", cekHmacKey, new Uint8Array([...cekInfo, 1]));
    const contentEncryptionKey = await crypto.subtle.importKey("raw", new Uint8Array(cekBits).slice(0, 16), { name: "AES-GCM" }, false, ["encrypt"]);

    const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
    const nonceHmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const nonceBits = await crypto.subtle.sign("HMAC", nonceHmacKey, new Uint8Array([...nonceInfo, 1]));
    const nonce = new Uint8Array(nonceBits).slice(0, 12);

    const paddedPayload = new Uint8Array([...encoder.encode(payload), 2]);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, contentEncryptionKey, paddedPayload);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const localPubKeyBytes = new Uint8Array(localPubKeyRaw);
    const recordSize = new Uint8Array(4);
    new DataView(recordSize.buffer).setUint32(0, 4096);

    const body = new Uint8Array([
      ...salt, ...recordSize, localPubKeyBytes.length, ...localPubKeyBytes, ...new Uint8Array(encrypted),
    ]);

    const vapidJwt = await createVapidJwt(subscription.endpoint, vapidPublicKey, vapidPrivateKey, "mailto:hello@usevano.com");

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': `vapid t=${vapidJwt}, k=${vapidPublicKey}`,
        'TTL': '3600',
        'Urgency': 'high',
      },
      body,
    });

    return response.ok || response.status === 201;
  } catch (err) {
    console.error("Web push error:", err);
    return false;
  }
}

// ── SMS via Twilio (no-op when not configured) ─────────────────────────────
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

async function twilioSend(params: Record<string, string>): Promise<boolean> {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')?.trim();
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')?.trim();
  if (!sid || !token) return false;
  try {
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!resp.ok) console.warn('[dispatch twilio] error', resp.status, (await resp.text()).slice(0, 200));
    return resp.ok;
  } catch (e) {
    console.warn('[dispatch twilio] exception', e);
    return false;
  }
}

// WhatsApp — preferred pocket channel (no Irish carrier filtering, high open
// rates). Set TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 (sandbox) or your
// production WhatsApp sender.
async function sendHelperWhatsApp(to: string | null | undefined, body: string): Promise<boolean> {
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const waFrom = (Deno.env.get('TWILIO_WHATSAPP_FROM') || Deno.env.get('TWILIO_WA_FROM'))?.trim();
  if (!waFrom) return false;
  const from = waFrom.startsWith('whatsapp:') ? waFrom : `whatsapp:${waFrom}`;
  const ok = await twilioSend({ To: `whatsapp:${e164}`, From: from, Body: body });
  if (ok) console.log(`[dispatch whatsapp] sent to ${e164}`);
  return ok;
}

// SMS — independent fallback so a helper without WhatsApp (or a missed WhatsApp)
// still gets the offer in their pocket. Off until a carrier-trusted Irish
// number is configured (VANO_SMS_ENABLED=true + TWILIO_SMS_FROM).
async function sendHelperSms(to: string | null | undefined, body: string): Promise<boolean> {
  if (Deno.env.get('VANO_SMS_ENABLED')?.trim() !== 'true') return false;
  const e164 = normalizeIrishPhone(to);
  if (!e164) return false;
  const from = (Deno.env.get('TWILIO_SMS_FROM') || Deno.env.get('TWILIO_FROM_NUMBER'))?.trim();
  if (!from || from.startsWith('whatsapp:')) return false;
  const ok = await twilioSend({ To: e164, From: from, Body: body });
  if (ok) console.log(`[dispatch sms] sent to ${e164}`);
  return ok;
}

// Hit every configured pocket channel for one helper — WhatsApp AND SMS, in
// parallel. Independent so one missed/unconfigured channel never loses the job.
async function notifyHelperPhone(to: string | null | undefined, body: string): Promise<{ whatsapp: boolean; sms: boolean }> {
  const [whatsapp, sms] = await Promise.all([
    sendHelperWhatsApp(to, body),
    sendHelperSms(to, body),
  ]);
  return { whatsapp, sms };
}

// ── Gap-recruit nudge ───────────────────────────────────────────────────────
// The supply-side half of "always have the right person": when a job goes out
// to few or no matching helpers, tell a handful of available same-city helpers
// who DON'T have the category that a paying job just passed them by, with a
// link that pre-ticks it on their account page (/student-account?add=<cat>,
// behind the usual phone gate). A real missed job converts far better than a
// sign-up checkbox ever did — and it recruits into the exact category+city
// gap. gap_nudged_at is stamped BEFORE sending (cron idempotency convention):
// a crash between stamp and send loses one nudge, never double-texts.
async function sendGapRecruitNudges(opts: {
  supabase: ReturnType<typeof createClient>;
  city: string;
  category: string;
  catLabel: string;
  earnCents: number | null;
  siteUrl: string;
  /** Kit slug this job needed and the pool didn't have — switches the nudge
   *  from "add this category" to "have you got a mower?". */
  kitSlug?: string | null;
  kitLabelText?: string;
  kitCents?: number;
}): Promise<void> {
  const { supabase, city, category, catLabel, earnCents, siteUrl, kitSlug, kitLabelText, kitCents } = opts;
  try {
    const cooldownCutoff = new Date(Date.now() - GAP_NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // Multiple .or() filters AND together — same PostgREST idiom as the
    // dispatch lock above. NULL categories counts as "doesn't have it".
    const { data: candidates } = await supabase
      .from('household_helpers')
      .select('id, phone')
      .eq('city', city)
      .eq('status', 'approved')
      .eq('is_available', true)
      // Only ID-verified helpers can receive jobs (the first-job gate), so
      // don't recruit someone into a category they couldn't be offered anyway
      // — the onboarding nudge cron chases the ID check itself.
      .eq('id_verified', true)
      .not('phone', 'is', null)
      // Kit gaps target the OPPOSITE crowd to a category gap: helpers who
      // already do this work but haven't told us they own the gear (or don't
      // yet). Same NULL-counts-as-missing idiom.
      .or(kitSlug
        ? `own_kit.is.null,own_kit.not.cs.{${kitSlug}}`
        : `categories.is.null,categories.not.cs.{${category}}`)
      .or(`gap_nudged_at.is.null,gap_nudged_at.lt.${cooldownCutoff}`)
      // Proven responders first — they're the likeliest to actually opt in.
      .order('accepted_count', { ascending: false })
      .limit(GAP_NUDGE_MAX_RECIPIENTS);
    if (!candidates || candidates.length === 0) return;

    const ids = (candidates as Array<{ id: string }>).map((c) => c.id);
    // Atomic claim: stamp gap_nudged_at only on rows STILL un-nudged (or past
    // cooldown) and text ONLY the rows this call actually won. Without the
    // precondition, two same-city/thin-category dispatches racing the
    // SELECT→UPDATE window would both see gap_nudged_at null and both text the
    // same helpers — the double-text the cooldown is meant to prevent.
    const { data: claimed } = await supabase
      .from('household_helpers')
      .update({ gap_nudged_at: new Date().toISOString() })
      .in('id', ids)
      .or(`gap_nudged_at.is.null,gap_nudged_at.lt.${cooldownCutoff}`)
      .select('id, phone');
    const winners = (claimed as Array<{ id: string; phone?: string }> | null) ?? [];
    if (winners.length === 0) return;

    const earn = earnCents ? ` (€${(earnCents / 100).toFixed(2)} to you)` : '';
    const addUrl = kitSlug
      ? `${siteUrl}/student-account?kit=${encodeURIComponent(kitSlug)}`
      : `${siteUrl}/student-account?add=${encodeURIComponent(category)}`;
    // Demand pulls supply: the kit version quotes the extra the customer has
    // ALREADY agreed to pay, which is the whole reason to tick the box.
    const body = kitSlug
      ? `VANO: A ${catLabel} job in ${city} needed a ${(kitLabelText ?? 'piece of kit').toLowerCase()} — the customer paid €${((kitCents ?? 0) / 100).toFixed(0)} extra for one and it skipped you. Got one? Tick it in 10 seconds and you'll get the next: ${addUrl}`
      : `VANO: A ${catLabel} job${earn} just went out in ${city} — it skipped you because ${catLabel} isn't in your "Jobs I do" list. Add it in 10 seconds and you'll get the next one: ${addUrl}`;
    const results = await Promise.allSettled(
      winners.map((c) => notifyHelperPhone(c.phone, body)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled' && (r.value.whatsapp || r.value.sms)).length;
    console.log(`[dispatch] gap-recruit nudged ${ok}/${winners.length} helper(s) in ${city} without '${kitSlug ?? category}'`);
  } catch (e) {
    console.warn('[dispatch] gap-recruit nudge failed (non-fatal)', e);
  }
}

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
    const inbound = payload?.record ?? payload;
    const bookingId = inbound?.id;
    // Quiet mode (re-dispatch rounds): revive offers + re-ping pocket channels
    // (web push + WhatsApp + SMS) so a missed offer gets a real second chance.
    // Only the repeat *email* is suppressed — the original "View & Accept" links
    // keep working once offers are live, and repeat emails read as spam.
    const quiet = inbound?.quiet === true || payload?.quiet === true;

    if (!bookingId) {
      return new Response('Missing booking id', { status: 400 });
    }

    // SECURITY: never trust booking fields from the request body — a caller
    // could fake a 'pending' status / inflated price to drive helper SMS/push
    // spam. Load the authoritative row from the DB and use ITS values. If the
    // booking doesn't exist or isn't pending, there's nothing to dispatch.
    const { data: dbBooking } = await supabase
      .from('household_bookings')
      .select('id, city, status, category, scheduled_date, price_estimate_cents, booking_data, customer_lat, customer_lng, customer_address')
      .eq('id', bookingId)
      .maybeSingle();

    if (!dbBooking) {
      return new Response('Booking not found — skipping', { status: 200 });
    }
    const { city, status, category, scheduled_date, price_estimate_cents } = dbBooking as {
      city: string | null; status: string; category: string;
      scheduled_date: string | null; price_estimate_cents: number | null;
    };
    // Students respond to money: show what they'd actually keep.
    // DIRECT-PAY bookings (booking_data.direct_pay): the customer pays the
    // helper the FULL job price directly — 100%, no cut. Legacy escrow
    // bookings still in flight keep the old 85% payout figure so the offer
    // never overpromises vs what actually lands.
    // The OFFER's location line: neighbourhood, never the address. Helpers
    // need enough to judge the trip ("Salthill" vs "Oranmore"); the exact
    // address unlocks on accept. Falls back to the city, then a safe generic.
    const areaLabel = approxAreaLabel({
      lat: (dbBooking as { customer_lat?: number | null }).customer_lat ?? null,
      lng: (dbBooking as { customer_lng?: number | null }).customer_lng ?? null,
      address: (dbBooking as { customer_address?: string | null }).customer_address ?? null,
      city,
    });
    const bookingDataForPay = (dbBooking as { booking_data?: Record<string, unknown> | null }).booking_data ?? null;
    const isDirectPay = bookingDataForPay?.direct_pay === true;
    const helperPayBaseCents = Math.max(
      typeof price_estimate_cents === 'number' ? price_estimate_cents : 0,
      Number(bookingDataForPay?.helper_pay_base_cents) || 0,
    );
    const earnCents = helperPayBaseCents > 0
      ? (isDirectPay ? helperPayBaseCents : Math.floor(helperPayBaseCents * 0.85))
      : null;

    if (status !== 'pending') {
      return new Response('Not a pending booking — skipping', { status: 200 });
    }

    // Atomic dispatch claim: two invocations for the same booking arriving
    // within seconds (checkout dispatch racing a retry, admin button racing the
    // cron) would BOTH pass the offer-count idempotency check below and each
    // blast every helper — the offer upsert dedupes, but the notifications
    // don't. This conditional UPDATE lets only one racer through; the other
    // bails. A genuine re-dispatch round (minutes later) passes because
    // last_dispatched_at is older than the lock window.
    const DISPATCH_LOCK_SECONDS = 20;
    const lockCutoff = new Date(Date.now() - DISPATCH_LOCK_SECONDS * 1000).toISOString();
    const { data: claimed } = await supabase
      .from('household_bookings')
      .update({ last_dispatched_at: new Date().toISOString() })
      .eq('id', bookingId)
      .or(`last_dispatched_at.is.null,last_dispatched_at.lt.${lockCutoff}`)
      .select('id')
      .maybeSingle();
    if (!claimed) {
      return new Response('Dispatch just ran — skipping duplicate', { status: 200 });
    }

    // Expire any stale pending offers so re-dispatch isn't blocked by the idempotency check.
    await supabase
      .from('household_job_offers')
      .update({ status: 'expired' })
      .eq('booking_id', bookingId)
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());

    // Also expire leftover 'accepted' offers. This booking is back to
    // 'pending' with no helper (verified above), so an accepted offer is by
    // definition stale — accept-job marks the claimer's offer 'accepted', but
    // every release path (helper_release, sweep-stalled-jobs,
    // remind-unpaid-bookings) only expires 'pending' rows. Without this, a
    // booking whose one-tap-accepted helper released it could NEVER
    // re-dispatch: the surviving accepted offer tripped the "Offers already
    // sent" idempotency check on every round, forever, silently.
    await supabase
      .from('household_job_offers')
      .update({ status: 'expired' })
      .eq('booking_id', bookingId)
      .eq('status', 'accepted');

    // Idempotency: skip if non-expired offers already exist.
    const { count: existingOffers } = await supabase
      .from('household_job_offers')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .neq('status', 'expired');

    if (existingOffers && existingOffers > 0) {
      return new Response('Offers already sent', { status: 200 });
    }

    // 'custom' is the search-bar catch-all (every "name any job" booking).
    // Helpers can't pick 'custom' as a category on the join form, so filtering
    // by it would match NOBODY and silently kill the entire search-bar funnel
    // — custom jobs are everyday tasks any approved helper can do, so they
    // fan out to everyone available. Real categories still filter as before.
    // 'business' (temp staff — flyers/sampling/shop cover, owner test
    // 2026-07-23) is the same shape: not a join-form skill, any approved
    // helper can do it, so it fans out too. Both auto-skip gap nudges below.
    // Shared with the booking sheet's helper bench so the faces the customer
    // is shown before booking are exactly the pool that gets the offer.
    const isCatchAll = isCatchAllCategory(category);

    // ── KIT MATCHING (2026-07-30) ────────────────────────────────────────
    // The customer said they have no mower and paid the hire fee for one, so
    // this offer may ONLY go to a helper who actually owns one — promising
    // gear and sending someone empty-handed is worse than never offering it.
    // A HARD filter, deliberately: helpers with a null own_kit simply don't
    // match kit jobs (they still get every other job, and the gap nudge below
    // invites them to tick the box). Fail-soft on shape — an unrecognised
    // slug is dropped by normalizeKit rather than emptying the pool.
    const kitRequired = normalizeKit((bookingDataForPay as Record<string, unknown> | null)?.kit_required);
    const withKit = <T extends { contains: (c: string, v: string[]) => T }>(q: T): T =>
      kitRequired.length ? q.contains('own_kit', kitRequired) : q;

    // Find helpers in the booking city first (bookings without a city skip
    // straight to the platform-wide search below).
    let helpers: Array<{ id: string; name: string; phone: string; email?: string; user_id?: string }> | null = null;
    if (city) {
      let cityQuery = supabase
        .from('household_helpers')
        .select('id, name, phone, email, user_id')
        .eq('city', city)
        .eq('status', 'approved')
        .eq('is_available', true)
        // THE FIRST-JOB GATE: only helpers who passed the free Stripe
        // Identity check receive offers. This is what makes the marketing
        // claim "every helper is ID-verified before their first job" TRUE —
        // it keys on id_verified alone (free), never the paid tick.
        .eq('id_verified', true);
      if (!isCatchAll) cityQuery = cityQuery.contains('categories', [category]);
      cityQuery = withKit(cityQuery);
      // ✓-Verified helpers get first dibs (the badge's tangible perk — the
      // €2/month tick has to buy something real), then fair rotation by
      // fewest accepted jobs. vano_verified = email + ID + active plan.
      const { data: cityHelpers, error: helpersError } = await cityQuery
        .order('vano_verified', { ascending: false })
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
      let allQuery = supabase
        .from('household_helpers')
        .select('id, name, phone, email, user_id')
        .eq('status', 'approved')
        .eq('is_available', true)
        .eq('id_verified', true); // first-job gate — same as the city query
      if (!isCatchAll) allQuery = allQuery.contains('categories', [category]);
      allQuery = withKit(allQuery);
      const { data: allHelpers, error: allErr } = await allQuery
        .order('vano_verified', { ascending: false })
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
        .select('customer_name, customer_email, customer_phone, scheduled_date')
        .eq('id', bookingId)
        .maybeSingle() as { data: { customer_name?: string; customer_email?: string; customer_phone?: string; scheduled_date?: string } | null };

      const custEmail = fullBooking?.customer_email;
      const custName = fullBooking?.customer_name && fullBooking.customer_name !== 'Guest'
        ? fullBooking.customer_name : 'there';
      const catLabel = CATEGORY_LABELS[category] ?? 'job';
      const trackUrl = `${siteUrl}/track/${bookingId}`;
      const ref = bookingId.slice(-8).toUpperCase();

      if (resendKey && custEmail && !quiet) {
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

      // Instant admin escalation — WhatsApp + guaranteed email fallback + a
      // tap-to-call link to the customer, via the canonical notify-admin-whatsapp
      // function (fixes the old plain-email-only ping that could silently vanish).
      // Fire-and-forget: an alert failure must never break dispatch.
      if (!quiet) {
        fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'no_helpers',
            stage: 'none_available',
            customer_name: fullBooking?.customer_name,
            customer_phone: fullBooking?.customer_phone,
            customer_email: custEmail,
            category,
            city,
            scheduled_date: fullBooking?.scheduled_date,
            price_euros: typeof price_estimate_cents === 'number' && price_estimate_cents > 0
              ? (price_estimate_cents / 100).toFixed(2) : undefined,
            booking_id: bookingId,
          }),
        }).catch(() => {});
      }

      // Nobody matched, but the gap is still recruitable: available same-city
      // helpers WITHOUT this category just missed real money — tell them.
      if (!quiet && !isCatchAll && city) {
        await sendGapRecruitNudges({ supabase, city, category, catLabel, earnCents, siteUrl });
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

    // NOTE: no ignoreDuplicates — on re-dispatch the conflict UPDATE revives
    // expired (booking_id, helper_id) rows with a fresh expiry. With DO
    // NOTHING, a re-dispatched job could never get live offers again.
    const { error: insertError } = await supabase
      .from('household_job_offers')
      .upsert(offers, { onConflict: 'booking_id,helper_id' });

    if (insertError) {
      console.error('[dispatch] insert offers error', insertError);
      return new Response('Failed to insert offers', { status: 500 });
    }

    console.log(`[dispatch] offered booking ${bookingId} to ${offers.length} helper(s)${expandedSearch ? ' (platform-wide)' : ` in ${city}`}`);

    // Ping the owner's WhatsApp on every NEW job (not quiet re-dispatch rounds)
    // so you see a worker is being found in real time — same canonical channel
    // as the no-helper alert (WhatsApp + guaranteed email fallback).
    if (!quiet) {
      fetch(`${supabaseUrl}/functions/v1/notify-admin-whatsapp`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'job_dispatched',
          category,
          city,
          scheduled_date,
          worker_count: offers.length,
          expanded: expandedSearch,
          price_euros: typeof price_estimate_cents === 'number' && price_estimate_cents > 0
            ? (price_estimate_cents / 100).toFixed(2) : undefined,
          booking_id: bookingId,
        }),
      }).catch(() => {});
    }

    const catLabel = CATEGORY_LABELS[category] ?? 'Household help';
    const jobUrl = `${siteUrl}/student-job/${bookingId}`;

    // What the offer actually says — the "better info" principle: a custom
    // booking's real job name (extra_label) beats the generic category, the
    // customer's own words (note) ride along, and the booked duration +
    // friendly "when" answer the two questions a helper asks before tapping.
    const jobLabel = (typeof bookingDataForPay?.extra_label === 'string' && bookingDataForPay.extra_label.trim())
      ? (bookingDataForPay.extra_label as string).trim()
      : catLabel;
    const noteRaw = typeof bookingDataForPay?.note === 'string' ? (bookingDataForPay.note as string).trim() : '';
    const jobNote = noteRaw && noteRaw.toLowerCase() !== jobLabel.toLowerCase()
      ? (noteRaw.length > 140 ? `${noteRaw.slice(0, 139)}…` : noteRaw)
      : '';
    // Offers read in words: the builder's quarter-hour labels are stored as
    // decimals for the price parsers ("1.75 hours"), which is not something to
    // text a student at 8am.
    const duration = typeof bookingDataForPay?.size_label === 'string' && (bookingDataForPay.size_label as string).trim()
      ? durationText((bookingDataForPay.size_label as string).trim())
      : '';
    const whenText = friendlyWhen(scheduled_date);
    // Kit jobs say so on the offer. The helper is only being texted because
    // their own_kit matched, but "bring your mower" has to be impossible to
    // miss — turning up without it is the one way this job fails.
    const kitText = kitRequired.length ? `Bring your ${kitLabel(kitRequired).toLowerCase()} — the customer has none.` : '';

    // One-tap accept links — a signed, expiring, per-helper link that claims the
    // job in a single tap with no login (see accept-job + _shared/acceptToken).
    // Removes the #1 reason offers get missed: friction. Falls back to jobUrl if
    // signing ever fails so a helper always has a working link.
    const expEpoch = Math.floor(Date.parse(expiresAt) / 1000);
    const acceptUrlByHelper = new Map<string, string>();
    await Promise.all(
      (helpers as Array<{ id: string; user_id?: string }>).map(async (h) => {
        try {
          const tok = await signAcceptToken({ b: bookingId, h: h.id, u: h.user_id ?? null, e: expEpoch });
          acceptUrlByHelper.set(h.id, `${supabaseUrl}/functions/v1/accept-job?t=${tok}`);
        } catch {
          acceptUrlByHelper.set(h.id, jobUrl);
        }
      }),
    );
    const acceptUrlFor = (id: string) => acceptUrlByHelper.get(id) ?? jobUrl;

    // Web push first — the only channel that reaches a pocket instantly.
    // Sent on every round (incl. quiet re-dispatch): the tag replaces any
    // earlier notification for the same job instead of stacking.
    {
      const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
      const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
      const userIds = helpers.map((h) => h.user_id).filter(Boolean) as string[];
      if (vapidPublicKey && vapidPrivateKey && userIds.length > 0) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .in('user_id', userIds);
        if (subs && subs.length > 0) {
          const pushPayload = JSON.stringify({
            title: earnCents ? `Earn ${fmtEuro(earnCents)} — ${jobLabel}` : `New job — ${jobLabel}`,
            body: `${areaLabel}${duration ? ` · ${duration}` : ''} · first to accept gets it`,
            tag: `vano-job-${bookingId}`,
            url: `/student-job/${bookingId}`,
          });
          const results = await Promise.allSettled(
            (subs as Array<{ endpoint: string; p256dh: string; auth: string }>).map((s) =>
              sendWebPush(s, pushPayload, vapidPublicKey, vapidPrivateKey),
            ),
          );
          const ok = results.filter((r) => r.status === 'fulfilled' && r.value).length;
          console.log(`[dispatch] web push sent to ${ok}/${subs.length} subscription(s)`);
        }
      }
    }

    // Pocket channels — WhatsApp + SMS — to every helper, on EVERY round
    // (including quiet re-dispatch reminders). Web push only reaches helpers
    // who subscribed, so before this the reminder rounds reached almost nobody
    // and offers expired unseen. Reminders are prefixed so they don't read as a
    // brand-new job. Only the repeat *email* is suppressed on quiet rounds.
    {
      const reminderPrefix = quiet ? 'Still open ⏰ ' : '';
      const whenShort = /^ASAP/.test(whenText) ? 'ASAP' : whenText;
      const lead = `VANO: ${reminderPrefix}${earnCents ? `Earn ${fmtEuro(earnCents)} — ` : ''}${jobLabel}${duration ? ` (${duration})` : ''} in ${areaLabel}, ${whenShort}.`;
      const phoneHelpers = (helpers as Array<{ id: string; phone?: string }>).filter((h) => h.phone);
      const phoneResults = await Promise.allSettled(
        // Per-helper one-tap link: tapping claims the job, no login.
        phoneHelpers.map((h) => notifyHelperPhone(h.phone, `${lead} Tap to accept (first gets it): ${acceptUrlFor(h.id)}`)),
      );
      const waOk  = phoneResults.filter((r) => r.status === 'fulfilled' && r.value.whatsapp).length;
      const smsOk = phoneResults.filter((r) => r.status === 'fulfilled' && r.value.sms).length;
      console.log(`[dispatch] pocket channels${quiet ? ' (reminder)' : ''} — WhatsApp ${waOk}/${phoneHelpers.length}, SMS ${smsOk}/${phoneHelpers.length}`);
    }

    // Email each helper — designed to be decided in one glance: how much
    // (header), what/where/when (one details card), then ONE big button that
    // claims the job in a single tap (the signed per-helper accept link, no
    // login). The customer's own words ride along so the helper knows exactly
    // what they're saying yes to.
    if (!quiet && resendKey) {
      const emailResults = await Promise.allSettled(
        (helpers as Array<{ id: string; name: string; phone: string; email?: string }>)
          .filter((h) => h.email)
          .map(async (h) => {
            const firstName = h.name.split(' ')[0];
            const acceptUrl = acceptUrlFor(h.id);
            const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#4a7c59;padding:26px 28px 20px;">
    <p style="margin:0 0 6px;color:#dcebe0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">New job near you</p>
    <p style="margin:0;color:#fff;font-size:28px;font-weight:800;line-height:1.15;">${earnCents ? `Earn ${fmtEuro(earnCents)}` : escapeHtml(jobLabel)}</p>
    ${earnCents && isDirectPay ? `<p style="margin:6px 0 0;color:#dcebe0;font-size:13px;font-weight:600;">Paid straight to you — you keep 100%</p>` : ''}
  </div>
  <div style="padding:22px 28px 26px;">
    <p style="margin:0 0 14px;color:#374151;font-size:15px;">Hi ${escapeHtml(firstName)} — first to accept gets it:</p>
    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f6f8f6;border:1px solid #d5e2d8;border-radius:14px;margin:0 0 18px;">
      <tr><td style="padding:14px 18px 2px;color:#111827;font-size:16px;font-weight:700;">${escapeHtml(jobLabel)}${duration ? ` · ${escapeHtml(duration)}` : ''}</td></tr>
      ${jobNote ? `<tr><td style="padding:2px 18px 0;color:#374151;font-size:14px;font-style:italic;line-height:1.5;">&ldquo;${escapeHtml(jobNote)}&rdquo;</td></tr>` : ''}
      ${kitText ? `<tr><td style="padding:8px 18px 0;color:#166534;font-size:14px;font-weight:700;line-height:1.5;">🚜 ${escapeHtml(kitText)}</td></tr>` : ''}
      <tr><td style="padding:8px 18px 2px;color:#374151;font-size:14px;">📍 ${escapeHtml(areaLabel)} <span style="color:#9ca3af;">· exact address when you accept</span></td></tr>
      <tr><td style="padding:2px 18px 14px;color:#374151;font-size:14px;">🕐 ${escapeHtml(whenText)}</td></tr>
    </table>
    <a href="${acceptUrl}" style="display:block;background:#4a7c59;color:#fff;font-size:17px;font-weight:700;padding:16px 24px;border-radius:100px;text-decoration:none;text-align:center;">Accept this job →</a>
    <p style="margin:10px 0 0;color:#6b7280;font-size:13px;text-align:center;">One tap claims it — no login needed. This link is just for you.</p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;text-align:center;">Offer expires in ${OFFER_TTL_MINUTES} minutes · <a href="${jobUrl}" style="color:#4a7c59;font-weight:600;">see full details first</a></p>
  </div>
  <div style="border-top:1px solid #f3f4f6;background:#fafafa;padding:12px 28px;">
    <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">You get job offers as an approved VANO helper. Pause them anytime — flip &ldquo;Available&rdquo; off in <a href="${siteUrl}/student-dashboard" style="color:#6b7280;">your dashboard</a>.</p>
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
                  ? `Earn ${fmtEuro(earnCents)} — ${jobLabel} in ${areaLabel} (1 tap to accept)`
                  : `New VANO job — ${jobLabel} in ${areaLabel}`,
                html,
                text: `Hi ${firstName}! ${earnCents ? `Earn ${fmtEuro(earnCents)}${isDirectPay ? ' (you keep 100%)' : ''} — ` : ''}${jobLabel}${duration ? ` (${duration})` : ''} in ${areaLabel}. When: ${whenText}.${jobNote ? ` "${jobNote}".` : ''}${kitText ? ` ${kitText}` : ''} Accept in one tap (first gets it): ${acceptUrl} — expires in ${OFFER_TTL_MINUTES} min. Full details: ${jobUrl}`,
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
    } else if (quiet) {
      console.log('[dispatch] quiet re-dispatch — offers revived + pocket channels re-pinged (push + WhatsApp + SMS), no repeat email');
    } else {
      console.info('[dispatch] RESEND_API_KEY not set — skipping helper notifications');
    }

    // Thin coverage — the job went out, but city-side coverage is a supply
    // gap: either so few local helpers matched, or NONE did and the search
    // went platform-wide. Recruit into it. (Skipped on quiet re-dispatch
    // rounds and for the 'custom' catch-all, which already fans out to
    // everyone.)
    if (!quiet && !isCatchAll && city && (expandedSearch || offers.length < GAP_NUDGE_MIN_COVERAGE)) {
      // A kit job that went thin is a KIT gap, not a category gap — the local
      // helpers do garden work, they just haven't told us they own a mower.
      // One clear ask (the first required item), quoting the money the
      // customer has already agreed to pay for it.
      const gapKit = kitRequired[0] ?? null;
      await sendGapRecruitNudges({
        supabase, city, category, catLabel, earnCents, siteUrl,
        kitSlug: gapKit,
        kitLabelText: gapKit ? kitLabel([gapKit]) : undefined,
        kitCents: gapKit ? KIT_HIRE_CENTS[gapKit] ?? 0 : 0,
      });
    }

    return new Response(
      JSON.stringify({ dispatched: offers.length, city, bookingId, expandedSearch, quiet, notified: Boolean(resendKey) }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dispatch] unhandled error', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
