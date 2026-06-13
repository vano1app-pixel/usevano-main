// Signed one-tap accept tokens for household job offers.
//
// A token lets a helper claim ONE specific job as themselves from a link in
// their WhatsApp/SMS/email — no login, no friction. Security model is the same
// as a Stripe/Supabase magic link: the token is HMAC-signed (unforgeable),
// expires with the offer, and authorises nothing beyond "accept this one job
// as this one helper". It is delivered only to that helper, privately.
//
// Format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, part1))
//
// Signing secret: ACCEPT_LINK_SECRET if set, else the service-role key (a
// strong server-only secret every function already holds). Both the signer
// (dispatch) and verifier (accept-job) read the same env, so they agree.

export interface AcceptTokenPayload {
  b: string;          // booking id
  h: string;          // household_helpers.id
  u?: string | null;  // helper auth user id, when they already have one
  e: number;          // expiry, epoch seconds
}

function secretKey(): string {
  return (Deno.env.get('ACCEPT_LINK_SECRET')?.trim()) ||
         (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(part: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(part));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signAcceptToken(payload: AcceptTokenPayload): Promise<string> {
  const part = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(part));
  return `${part}.${sig}`;
}

export async function verifyAcceptToken(token: string): Promise<AcceptTokenPayload | null> {
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const part = token.slice(0, dot);
  const sigGiven = token.slice(dot + 1);
  if (!sigGiven) return null;
  let ok = false;
  try {
    ok = timingSafeEqual(b64urlDecode(sigGiven), await hmac(part));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload: AcceptTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(part)));
  } catch {
    return null;
  }
  if (!payload?.b || !payload?.h || typeof payload.e !== 'number') return null;
  if (Date.now() / 1000 > payload.e) return null; // expired
  return payload;
}
