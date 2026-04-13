// Notify a freelancer that a business has sent a direct "Hire now" request.
// Fan-out channels: in-app notifications row + Web Push + email (Resend).
// Caller sends only a hire_request_id; this function is service-role only and re-reads
// the row to prevent tampering.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Web Push helpers (copied from notify-new-message for self-contained deploy) ─── */

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
        ["sign"],
      );
    } else {
      cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        keyData,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    }
  } catch {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  }

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
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
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );

    const subscriberPubKey = await crypto.subtle.importKey(
      "raw",
      base64UrlToArrayBuffer(subscription.p256dh),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    );

    const sharedSecret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberPubKey },
      localKeyPair.privateKey,
      256,
    );

    const authSecret = base64UrlToArrayBuffer(subscription.auth);
    const localPubKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
    const encoder = new TextEncoder();

    const prkKey = await crypto.subtle.importKey("raw", authSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const prk = await crypto.subtle.sign("HMAC", prkKey, sharedSecret);

    const cekInfo = encoder.encode("Content-Encoding: aes128gcm\0");
    const cekHmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const cekBits = await crypto.subtle.sign("HMAC", cekHmacKey, new Uint8Array([...cekInfo, 1]));
    const contentEncryptionKey = await crypto.subtle.importKey(
      "raw",
      new Uint8Array(cekBits).slice(0, 16),
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const nonceInfo = encoder.encode("Content-Encoding: nonce\0");
    const nonceHmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const nonceBits = await crypto.subtle.sign("HMAC", nonceHmacKey, new Uint8Array([...nonceInfo, 1]));
    const nonce = new Uint8Array(nonceBits).slice(0, 12);

    const paddedPayload = new Uint8Array([...encoder.encode(payload), 2]);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      contentEncryptionKey,
      paddedPayload,
    );

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const localPubKeyBytes = new Uint8Array(localPubKeyRaw);
    const recordSize = new Uint8Array(4);
    new DataView(recordSize.buffer).setUint32(0, 4096);

    const body = new Uint8Array([
      ...salt,
      ...recordSize,
      localPubKeyBytes.length,
      ...localPubKeyBytes,
      ...new Uint8Array(encrypted),
    ]);

    const vapidJwt = await createVapidJwt(
      subscription.endpoint,
      vapidPublicKey,
      vapidPrivateKey,
      "mailto:hello@usevano.com",
    );

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Authorization": `vapid t=${vapidJwt}, k=${vapidPublicKey}`,
        TTL: "86400",
        Urgency: "high",
      },
      body,
    });

    return response.ok || response.status === 201;
  } catch (err) {
    console.error("Web push error:", err);
    return false;
  }
}

/* ─── Handler ─── */

/**
 * Normalize a raw phone string into E.164 (e.g. "0899817111" -> "+353899817111").
 * The freelancer phone comes from PhoneRequiredModal which doesn't enforce
 * format, so we do best-effort cleanup here. Returns null if we can't make
 * something that at least looks like E.164.
 *
 * Heuristics:
 *  - Starts with "+" -> already E.164, trust it (after stripping whitespace)
 *  - Starts with "00" -> convert to "+"
 *  - 10 digits starting with "0" and second digit "8" -> Irish mobile without
 *    the international prefix; drop the leading 0 and prepend "+353"
 *  - 9 digits starting with "8" -> Irish mobile without leading 0; prepend "+353"
 *  - Otherwise null (safer to skip SMS than to blast to the wrong country)
 */
function normalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-()]/g, "").trim();
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) {
    // Must be + followed by only digits, at least 8 of them
    return /^\+\d{8,15}$/.test(cleaned) ? cleaned : null;
  }
  if (cleaned.startsWith("00")) {
    const candidate = "+" + cleaned.slice(2);
    return /^\+\d{8,15}$/.test(candidate) ? candidate : null;
  }
  // Irish mobile patterns
  if (/^08[3-9]\d{7}$/.test(cleaned)) {
    // e.g. 0899817111 -> +353899817111
    return "+353" + cleaned.slice(1);
  }
  if (/^8[3-9]\d{7}$/.test(cleaned)) {
    // e.g. 899817111 -> +353899817111
    return "+353" + cleaned;
  }
  return null;
}

const budgetLabels: Record<string, string> = {
  under_100: "Under €100",
  "100_250": "€100–250",
  "250_500": "€250–500",
  "500_plus": "€500+",
  unsure: "Not sure",
};
const timelineLabels: Record<string, string> = {
  this_week: "This week",
  "2_weeks": "2 weeks",
  "1_month": "1 month",
  flexible: "Flexible",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const { hire_request_id } = await req.json();
    if (!hire_request_id || typeof hire_request_id !== "string") {
      return new Response(JSON.stringify({ error: "hire_request_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(supabaseUrl, serviceKey);

    // Load the hire request server-side (authoritative).
    const { data: hr, error: hrError } = await svc
      .from("hire_requests")
      .select(
        "id, requester_id, target_freelancer_id, description, category, budget_range, timeline, expires_at, kind",
      )
      .eq("id", hire_request_id)
      .maybeSingle();

    if (hrError || !hr) {
      console.error("hire_request lookup failed", hrError);
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (hr.kind !== "direct") {
      return new Response(JSON.stringify({ error: "not_direct_hire" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Caller must be the requester (trust boundary).
    if (hr.requester_id !== callerId) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull requester + freelancer profile info
    const [{ data: requesterProfile }, { data: freelancerProfile }] = await Promise.all([
      svc.from("profiles").select("display_name, email").eq("user_id", hr.requester_id).maybeSingle(),
      svc.from("profiles").select("display_name, email").eq("user_id", hr.target_freelancer_id).maybeSingle(),
    ]);

    const requesterName = requesterProfile?.display_name || "A business";
    const freelancerEmail = freelancerProfile?.email || null;
    const preview = (hr.description || "").slice(0, 120);

    /* ── 1. In-app notification ── */
    await svc.from("notifications").insert({
      user_id: hr.target_freelancer_id,
      title: `🎯 ${requesterName} wants to hire you`,
      message: preview,
      read: false,
    });

    /* ── 2. Web push ── */
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    let pushesSent = 0;
    if (vapidPublicKey && vapidPrivateKey) {
      const { data: pushSubs } = await svc
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", hr.target_freelancer_id);

      const payload = JSON.stringify({
        title: `🎯 ${requesterName} wants to hire you`,
        body: `${preview} — respond within 2 hours`,
        url: "/hire-requests",
        tag: `hire-${hr.id}`,
      });

      for (const sub of pushSubs || []) {
        const ok = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          vapidPublicKey,
          vapidPrivateKey,
        );
        if (ok) pushesSent++;
        else await svc.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }

    // Shared site URL for email links + SMS deep-link.
    const siteUrl = (Deno.env.get("SITE_URL")?.trim() || "https://vanojobs.com").replace(/\/+$/, "");

    /* ── 3. Email via Resend ── */
    let emailed = false;
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
    if (resendKey && freelancerEmail) {
      const from = Deno.env.get("RESEND_FROM")?.trim() || "VANO <onboarding@resend.dev>";
      const subject = `🎯 ${requesterName} wants to hire you on VANO`;
      const budget = budgetLabels[hr.budget_range || ""] || hr.budget_range || "Not specified";
      const timeline = timelineLabels[hr.timeline || ""] || hr.timeline || "Not specified";
      const text = [
        `${requesterName} just sent you a direct hire request on VANO.`,
        ``,
        `Project:`,
        `"${(hr.description || "").slice(0, 500)}"`,
        ``,
        `Category: ${hr.category || "not specified"}`,
        `Timeline: ${timeline}`,
        `Budget: ${budget}`,
        ``,
        `⚡ You have 2 hours to accept — after that the request expires.`,
        ``,
        `Review it here: ${siteUrl}/hire-requests`,
      ].join("\n");

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [freelancerEmail], subject, text }),
        });
        emailed = res.ok;
        if (!emailed) {
          console.warn(`Resend error ${res.status}: ${await res.text()}`);
        }
      } catch (err) {
        console.warn("Resend fetch failed", err);
      }
    }

    /* ── 4. SMS via Twilio (hedged: try alphanumeric sender first, fall back to number) ── */
    //
    // Freelancer phones live on `student_profiles.phone`. We try sending from
    // TWILIO_FROM_NUMBER (typically "VANO" alphanumeric sender) first. Irish
    // carriers sometimes reject unregistered alphanumeric senders — when that
    // happens Twilio returns an error; we retry with TWILIO_FALLBACK_FROM_NUMBER
    // (a real Twilio phone number owned by the account) so the SMS still lands.
    //
    // Failures are swallowed: SMS is fire-and-forget so a bad Twilio route
    // never blocks the in-app/push/email chain above.
    let smsSent = false;
    let smsSender: string | null = null;
    try {
      const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID")?.trim();
      const authToken = Deno.env.get("TWILIO_AUTH_TOKEN")?.trim();
      const fromPrimary = Deno.env.get("TWILIO_FROM_NUMBER")?.trim();
      const fromFallback = Deno.env.get("TWILIO_FALLBACK_FROM_NUMBER")?.trim();
      const fromCandidates = [fromPrimary, fromFallback].filter(
        (v): v is string => Boolean(v && v.length > 0),
      );

      if (accountSid && authToken && fromCandidates.length > 0) {
        const { data: sp } = await svc
          .from("student_profiles")
          .select("phone")
          .eq("user_id", hr.target_freelancer_id)
          .maybeSingle();
        const toPhone = normalizeE164(sp?.phone ?? null);

        if (toPhone) {
          const body = `🎯 ${requesterName} wants to hire you on VANO! Respond within 2 hours: ${siteUrl}/hire-requests`;
          const basicAuth = "Basic " + btoa(`${accountSid}:${authToken}`);

          for (const from of fromCandidates) {
            try {
              const twRes = await fetch(
                `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
                {
                  method: "POST",
                  headers: {
                    Authorization: basicAuth,
                    "Content-Type": "application/x-www-form-urlencoded",
                  },
                  body: new URLSearchParams({
                    From: from,
                    To: toPhone,
                    Body: body,
                  }).toString(),
                },
              );
              if (twRes.ok) {
                smsSent = true;
                smsSender = from;
                break;
              } else {
                const errText = await twRes.text();
                console.warn(
                  `Twilio send failed from=${from} status=${twRes.status}: ${errText}`,
                );
              }
            } catch (fetchErr) {
              console.warn(`Twilio fetch error from=${from}:`, fetchErr);
            }
          }
        } else {
          console.log(
            "Skipping SMS: freelancer phone missing or unparseable (user=" +
              hr.target_freelancer_id + ")",
          );
        }
      }
    } catch (smsErr) {
      // Never let SMS break the whole notification response.
      console.warn("SMS block threw unexpectedly:", smsErr);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        in_app: true,
        push: pushesSent,
        email: emailed,
        sms: { sent: smsSent, sender: smsSender },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("notify-direct-hire error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
