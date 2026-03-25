import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Web Push helpers
async function importVapidKey(rawPrivateKey: string): Promise<CryptoKey> {
  const keyData = base64UrlToArrayBuffer(rawPrivateKey);
  return crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

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

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<boolean> {
  try {
    // Generate ECDH key pair for encryption
    const localKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"]
    );

    // Import subscriber's public key
    const subscriberPubKeyRaw = base64UrlToArrayBuffer(subscription.p256dh);
    const subscriberPubKey = await crypto.subtle.importKey(
      "raw",
      subscriberPubKeyRaw,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    // Derive shared secret
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: "ECDH", public: subscriberPubKey },
      localKeyPair.privateKey,
      256
    );

    const authSecret = base64UrlToArrayBuffer(subscription.auth);
    const localPubKeyRaw = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);

    // HKDF-based key derivation (simplified web push encryption)
    const encoder = new TextEncoder();
    
    // PRK = HKDF-Extract(auth_secret, shared_secret)
    const prkKey = await crypto.subtle.importKey("raw", authSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const prk = await crypto.subtle.sign("HMAC", prkKey, sharedSecret);

    // Info for content encryption key
    const cekInfo = new Uint8Array([
      ...encoder.encode("Content-Encoding: aes128gcm\0"),
    ]);
    const cekHmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const cekBits = await crypto.subtle.sign("HMAC", cekHmacKey, new Uint8Array([...cekInfo, 1]));
    const contentEncryptionKey = await crypto.subtle.importKey("raw", new Uint8Array(cekBits).slice(0, 16), { name: "AES-GCM" }, false, ["encrypt"]);

    // Info for nonce
    const nonceInfo = new Uint8Array([
      ...encoder.encode("Content-Encoding: nonce\0"),
    ]);
    const nonceHmacKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const nonceBits = await crypto.subtle.sign("HMAC", nonceHmacKey, new Uint8Array([...nonceInfo, 1]));
    const nonce = new Uint8Array(nonceBits).slice(0, 12);

    // Encrypt the payload
    const paddedPayload = new Uint8Array([...encoder.encode(payload), 2]); // delimiter
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      contentEncryptionKey,
      paddedPayload
    );

    // Build the body (aes128gcm format)
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

    // Create VAPID JWT
    const vapidJwt = await createVapidJwt(subscription.endpoint, vapidPublicKey, vapidPrivateKey, vapidSubject);

    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': `vapid t=${vapidJwt}, k=${vapidPublicKey}`,
        'TTL': '86400',
        'Urgency': 'high',
      },
      body: body,
    });

    return response.ok || response.status === 201;
  } catch (err) {
    console.error("Web push send error:", err);
    return false;
  }
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

  // Import the private key for signing
  const keyData = base64UrlToArrayBuffer(privateKey);
  
  // Try JWK format first (standard VAPID private keys are 32 bytes raw)
  let cryptoKey: CryptoKey;
  try {
    // Raw 32-byte private key - convert to JWK
    const rawKey = new Uint8Array(keyData);
    if (rawKey.length === 32) {
      const pubKeyRaw = base64UrlToArrayBuffer(publicKey);
      const pubKeyBytes = new Uint8Array(pubKeyRaw);
      // Extract x and y from uncompressed public key (skip 0x04 prefix)
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
      cryptoKey = await crypto.subtle.importKey(
        "pkcs8",
        keyData,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"]
      );
    }
  } catch {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  }

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const sigBytes = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32, 64);
  } else {
    // DER format
    let offset = 2;
    const rLen = sigBytes[offset + 1];
    r = sigBytes.slice(offset + 2, offset + 2 + rLen);
    offset = offset + 2 + rLen;
    const sLen = sigBytes[offset + 1];
    s = sigBytes.slice(offset + 2, offset + 2 + sLen);
    // Ensure 32 bytes each
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) r = new Uint8Array([...new Uint8Array(32 - r.length), ...r]);
    if (s.length < 32) s = new Uint8Array([...new Uint8Array(32 - s.length), ...s]);
  }

  const rawSig = new Uint8Array([...r, ...s]);
  const sigB64 = arrayBufferToBase64Url(rawSig);

  return `${unsignedToken}.${sigB64}`;
}

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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const callerId = claimsData.claims.sub;

    const body = await req.json();
    const job_id = body?.job_id;
    if (!job_id || typeof job_id !== "string" || !UUID_REGEX.test(job_id)) {
      return new Response(JSON.stringify({ error: "Valid job_id (UUID) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (job.posted_by !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobTags = (job.tags || []).map((t: string) => t.toLowerCase());
    if (jobTags.length === 0) {
      return new Response(
        JSON.stringify({ matched: 0, message: "No tags on job" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: students } = await supabase
      .from("student_profiles")
      .select("user_id, skills")
      .eq("is_available", true);

    if (!students || students.length === 0) {
      return new Response(
        JSON.stringify({ matched: 0, message: "No available students" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const matchedStudents = students.filter((s) => {
      const studentSkills = (s.skills || []).map((sk: string) => sk.toLowerCase());
      return studentSkills.some((skill: string) => jobTags.includes(skill));
    });

    if (matchedStudents.length === 0) {
      return new Response(
        JSON.stringify({ matched: 0, message: "No matching students" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create in-app notifications
    const notifications = matchedStudents.map((s) => ({
      user_id: s.user_id,
      title: "New shift matches your skills!",
      message: `"${job.title}" in ${job.location} — €${job.hourly_rate}/hr`,
      job_id: job.id,
    }));

    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (insertError) {
      console.error("Failed to insert notifications:", insertError);
    }

    // Send web push notifications
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    let pushSent = 0;

    if (vapidPublicKey && vapidPrivateKey) {
      const matchedUserIds = matchedStudents.map((s) => s.user_id);
      const { data: pushSubs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .in("user_id", matchedUserIds)
        .eq("notify_gigs", true);

      if (pushSubs && pushSubs.length > 0) {
        const pushPayload = JSON.stringify({
          title: "New gig matches your skills! 🎯",
          body: `"${job.title}" in ${job.location} — €${job.hourly_rate}/hr`,
          url: `/jobs/${job.id}`,
          tag: `job-${job.id}`,
        });

        const pushPromises = pushSubs.map(async (sub) => {
          const success = await sendWebPush(
            { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
            pushPayload,
            vapidPublicKey,
            vapidPrivateKey,
            "mailto:hello@usevano.com",
          );
          if (success) pushSent++;
          else {
            // Remove invalid subscription
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          }
        });

        await Promise.allSettled(pushPromises);
      }
    }

    return new Response(
      JSON.stringify({
        matched: matchedStudents.length,
        pushSent,
        message: `Notified ${matchedStudents.length} student(s), ${pushSent} push notification(s) sent`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("notify-matched-students error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
