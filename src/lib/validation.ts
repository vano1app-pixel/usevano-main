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
