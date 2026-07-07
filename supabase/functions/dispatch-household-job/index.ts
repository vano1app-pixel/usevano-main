import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signAcceptToken } from "../_shared/acceptToken.ts";

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

const CATEGORY_LABELS: Record<string, string> = {
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
      .select('id, city, status, category, scheduled_date, price_estimate_cents')
      .eq('id', bookingId)
      .maybeSingle();

    if (!dbBooking) {
      return new Response('Booking not found — skipping', { status: 200 });
    }
    const { city, status, category, scheduled_date, price_estimate_cents } = dbBooking as {
      city: string | null; status: string; category: string;
      scheduled_date: string | null; price_estimate_cents: number | null;
    };
    // Students respond to money: show what they'd keep (95% of the job).
    const earnCents = typeof price_estimate_cents === 'number' && price_estimate_cents > 0
      ? Math.floor(price_estimate_cents * 0.95)
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
    const isCatchAll = category === 'custom';

    // Find helpers in the booking city first (bookings without a city skip
    // straight to the platform-wide search below).
    let helpers: Array<{ id: string; name: string; phone: string; email?: string; user_id?: string }> | null = null;
    if (city) {
      let cityQuery = supabase
        .from('household_helpers')
        .select('id, name, phone, email, user_id')
        .eq('city', city)
        .eq('status', 'approved')
        .eq('is_available', true);
      if (!isCatchAll) cityQuery = cityQuery.contains('categories', [category]);
      // ✓-Verified helpers get first dibs (the badge's tangible perk), then
      // fair rotation by fewest accepted jobs.
      const { data: cityHelpers, error: helpersError } = await cityQuery
        .order('id_verified', { ascending: false })
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
        .eq('is_available', true);
      if (!isCatchAll) allQuery = allQuery.contains('categories', [category]);
      const { data: allHelpers, error: allErr } = await allQuery
        .order('id_verified', { ascending: false })
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
            title: earnCents ? `Earn €${(earnCents / 100).toFixed(2)} — ${catLabel}` : `New job — ${catLabel}`,
            body: `${city ?? 'Ireland'} · first to accept gets it`,
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
      const lead = `VANO: ${reminderPrefix}${earnCents ? `Earn €${(earnCents / 100).toFixed(2)} — ` : ''}${catLabel} in ${city ?? 'your area'}.`;
      const phoneHelpers = (helpers as Array<{ id: string; phone?: string }>).filter((h) => h.phone);
      const phoneResults = await Promise.allSettled(
        // Per-helper one-tap link: tapping claims the job, no login.
        phoneHelpers.map((h) => notifyHelperPhone(h.phone, `${lead} Tap to accept (first gets it): ${acceptUrlFor(h.id)}`)),
      );
      const waOk  = phoneResults.filter((r) => r.status === 'fulfilled' && r.value.whatsapp).length;
      const smsOk = phoneResults.filter((r) => r.status === 'fulfilled' && r.value.sms).length;
      console.log(`[dispatch] pocket channels${quiet ? ' (reminder)' : ''} — WhatsApp ${waOk}/${phoneHelpers.length}, SMS ${smsOk}/${phoneHelpers.length}`);
    }

    // Email each helper with a direct link to the specific job.
    if (!quiet && resendKey) {
      const when = scheduled_date ?? 'flexible';

      const emailResults = await Promise.allSettled(
        (helpers as Array<{ id: string; name: string; phone: string; email?: string }>)
          .filter((h) => h.email)
          .map(async (h) => {
            const firstName = h.name.split(' ')[0];
            const acceptUrl = acceptUrlFor(h.id);
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
    <a href="${acceptUrl}" style="display:inline-block;background:#4a7c59;color:#fff;font-size:14px;font-weight:600;padding:13px 24px;border-radius:100px;text-decoration:none;">Accept in one tap →</a>
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
                text: `Hi ${firstName}! ${earnCents ? `Earn €${(earnCents / 100).toFixed(2)} — ` : ''}${catLabel} in ${city ?? 'your area'}, when: ${when}. Tap to accept (first gets it): ${acceptUrl} (expires in ${OFFER_TTL_MINUTES} min)`,
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

    return new Response(
      JSON.stringify({ dispatched: offers.length, city, bookingId, expandedSearch, quiet, notified: Boolean(resendKey) }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[dispatch] unhandled error', err);
    return new Response('Unexpected error', { status: 500 });
  }
});
