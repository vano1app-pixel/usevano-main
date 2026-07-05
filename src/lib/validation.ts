// Small shared validators. Pure (no imports) so they're cheap to unit-test and
// reuse across the booking sheet, the join form and anywhere a phone is typed.

/**
 * Lightweight phone check for the booking flow: strips spaces, then requires
 * 7–15 chars of digits/`+`/separators. Deliberately permissive (we text a code
 * to confirm), but rejects empty / obviously-too-short input so a malformed
 * number never silently breaks dispatch. Mirrors the server-side guard.
 */
export function isValidPhone(raw: string): boolean {
  const clean = (raw ?? '').trim().replace(/\s+/g, '');
  return /^\+?[\d\s\-().]{7,15}$/.test(clean);
}

/**
 * Mirrors the edge functions' `normalizeIrishPhone` — the rule every SMS /
 * WhatsApp send is keyed on. Returns E.164 (`+3538…`, `+447…`) or null when
 * the number can't be normalized, i.e. we could accept the booking but never
 * text this customer (UK numbers typed as `07…`, landlines, etc.). Irish
 * mobiles work bare (08x…); anything else needs a `+`/`00` country code.
 */
export function normalizePhoneE164(raw: string): string | null {
  const cleaned = (raw ?? '').replace(/[\s\-().]/g, '').trim();
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
