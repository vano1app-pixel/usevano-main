// Short-lived signed session token for the phone-gated /student-account page.
//
// Minted by student-account-otp AFTER the helper proves they hold the phone
// (6-digit SMS/WhatsApp code), then presented as `account_token` in the body
// of every phone-authed helper mutation (update-helper-profile,
// household-helper-connect-link, cancel-verified-plan, delete-helper-account,
// …) and the find-helper-by-phone profile read. Knowing a helper's number is
// no longer enough to edit their profile, start payout onboarding or cancel
// their plan — you must be able to READ that phone.
//
// Same HMAC scheme + secret as _shared/acceptToken.ts, with an explicit
// purpose marker (`p:'acct'`) so the two token families can never be replayed
// across each other.
//
// Format:  base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, part1))

export interface AccountTokenPayload {
  p: 'acct';
  h: string; // household_helpers.id the session is for
  e: number; // expiry, epoch seconds
}

/** How long one code-verified account session lasts. */
export const ACCOUNT_TOKEN_TTL_SECONDS = 30 * 60;

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

export async function signAccountToken(helperId: string): Promise<string> {
  const payload: AccountTokenPayload = {
    p: 'acct',
    h: helperId,
    e: Math.floor(Date.now() / 1000) + ACCOUNT_TOKEN_TTL_SECONDS,
  };
  const part = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(part));
  return `${part}.${sig}`;
}

export async function verifyAccountToken(token: string): Promise<AccountTokenPayload | null> {
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
  let payload: AccountTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(part)));
  } catch {
    return null;
  }
  if (payload?.p !== 'acct' || !payload?.h || typeof payload.e !== 'number') return null;
  if (Date.now() / 1000 > payload.e) return null; // expired
  return payload;
}

/**
 * The one-line guard the phone-authed functions call: does this request carry
 * a live account session for exactly this helper row?
 */
export async function hasAccountAccess(token: unknown, helperId: string): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;
  const payload = await verifyAccountToken(token);
  return !!payload && payload.h === helperId;
}
