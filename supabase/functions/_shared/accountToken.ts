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

/** How long a "remember this device" token lasts (owner call, July 2026:
 *  verifying the SMS code once trusts that phone/browser for a month, so
 *  helpers stop re-typing their number every visit). Same HMAC format —
 *  the TTL is baked into the token's own `e` at mint time. */
export const DEVICE_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

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

export async function signAccountToken(
  helperId: string,
  ttlSeconds: number = ACCOUNT_TOKEN_TTL_SECONDS,
): Promise<string> {
  const payload: AccountTokenPayload = {
    p: 'acct',
    h: helperId,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
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

// ── Boost token (2026-07-30) — the narrow post-email-verify session ────────
// Minted by verify-student-email-otp the moment a helper proves their inbox,
// so the "boost your profile" screen on /verify-helper can save availability
// + kit/languages/vetting extras with zero extra codes. DELIBERATELY WEAKER
// than the account token: email proof is not phone proof, so this token is
// accepted by update-helper-profile ONLY for the low-stakes profile fields
// (availability, categories, extras) — never phone/email changes, the payout
// handle, photo, or anything the phone-gated surfaces protect. Distinct
// purpose marker keeps the three token families unreplayable across each
// other.

export interface BoostTokenPayload {
  p: 'bst';
  h: string; // household_helpers.id
  e: number; // expiry, epoch seconds
}

/** A boost session lasts long enough to fill one short screen. */
export const BOOST_TOKEN_TTL_SECONDS = 30 * 60;

export async function signBoostToken(helperId: string): Promise<string> {
  const payload: BoostTokenPayload = {
    p: 'bst',
    h: helperId,
    e: Math.floor(Date.now() / 1000) + BOOST_TOKEN_TTL_SECONDS,
  };
  const part = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(part));
  return `${part}.${sig}`;
}

/** Does this request carry a live boost session for exactly this helper row? */
export async function hasBoostAccess(token: unknown, helperId: string): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const part = token.slice(0, dot);
  const sigGiven = token.slice(dot + 1);
  if (!sigGiven) return false;
  let ok = false;
  try {
    ok = timingSafeEqual(b64urlDecode(sigGiven), await hmac(part));
  } catch {
    return false;
  }
  if (!ok) return false;
  let payload: BoostTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(part)));
  } catch {
    return false;
  }
  if (payload?.p !== 'bst' || payload?.h !== helperId || typeof payload?.e !== 'number') return false;
  return Date.now() / 1000 <= payload.e;
}
