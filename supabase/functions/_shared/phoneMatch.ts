// Safe phone-gate matching for helper self-service endpoints.
//
// The old inline matcher — `na.endsWith(nb) || nb.endsWith(na)` after a loose
// normalize — was a real auth bypass: the stored number "353899817111"
// endsWith "1", so a caller who knows only a helper_id could pass phone:"1"
// and clear the gate in ≤10 blind tries. These gates protect cancelling the
// paid plan, disconnecting payouts, and DELETING the account, so the match
// must require the FULL number, not a suffix.
//
// Approach: collapse every Irish-mobile spelling (+353 / 00353 / 0-trunk /
// bare) to the 9-digit national significant number and require exact equality.
// Non-mobile / foreign numbers fall back to an exact full-digit compare with a
// length floor, so a short suffix still can't match.

/** 9-digit Irish mobile national number (e.g. 899817111), or null if not one. */
export function irishMobileKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);        // 00-intl prefix
  if (d.startsWith('353')) d = d.slice(3);       // country code
  else if (d.startsWith('0')) d = d.slice(1);    // national trunk 0
  // Irish mobiles are 8X XXX XXXX — 9 digits starting with 8.
  return /^8\d{8}$/.test(d) ? d : null;
}

/**
 * True only when both numbers are the SAME full number. Irish mobiles match
 * across country-code/leading-zero spellings; anything else requires an exact
 * full-digit match (≥8 digits) so a partial suffix can never pass the gate.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = irishMobileKey(a);
  const kb = irishMobileKey(b);
  if (ka && kb) return ka === kb;
  const da = String(a ?? '').replace(/\D/g, '');
  const db = String(b ?? '').replace(/\D/g, '');
  return da.length >= 8 && da === db;
}
