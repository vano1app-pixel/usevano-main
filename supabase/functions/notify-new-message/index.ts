import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
        'TTL': '86400',
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const senderId = claimsData.claims.sub as string;
    const { recipient_id, message_preview } = await req.json();

    if (!recipient_id || typeof recipient_id !== "string") {
      return new Response(JSON.stringify({ error: "recipient_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get sender's display name
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", senderId)
      .single();

    const senderName = senderProfile?.display_name || "Someone";
    const preview = (message_preview || "").slice(0, 100) || "Sent you a message";

    // Get recipient's push subscriptions
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(JSON.stringify({ error: "Push not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pushSubs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", recipient_id)
      .eq("notify_messages", true);

    if (!pushSubs || pushSubs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No push subscription" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({
      title: `💬 ${senderName}`,
      body: preview,
      url: "/messages",
      tag: `msg-${senderId}`,
    });

    let sent = 0;
    for (const sub of pushSubs) {
      const success = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        pushPayload,
        vapidPublicKey,
        vapidPrivateKey,
      );
      if (success) sent++;
      else {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }

    return new Response(JSON.stringify({ sent, message: `${sent} push(es) sent` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-new-message error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
