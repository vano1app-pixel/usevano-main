// Best-effort phone formatting for Irish-style inputs. The goal isn't
// perfect E.164 correctness — we don't ship a libphonenumber — it's
// making the common Irish patterns ("0871234567", "353871234567",
// "(087) 123-4567") all land as the same canonical "+353 87 1234567"
// so our regex validators stop rejecting obviously-valid numbers and
// the freelancer doesn't have to re-type.
//
// Returns the input unchanged when the shape is ambiguous (very short
// strings, non-Irish country codes, etc.). Conservative on purpose —
// the worst outcome is "didn't normalise something normalisable";
// wrongly rewriting a valid international number would be much worse.

const IRISH_LOCAL_LENGTH = 9; // e.g. "87 1234567" — mobiles + landlines

/**
 * Normalize a user-entered Irish phone number to "+353 XX XXXXXXX".
 * Returns the input unchanged if it looks non-Irish or can't be parsed.
 */
export function normalizeIrishPhone(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  // Keep only digits and a leading + for parsing purposes.
  const stripped = trimmed.replace(/[^\d+]/g, '');
  if (!stripped) return trimmed;

  // Explicit non-Irish country code — hands-off.
  if (stripped.startsWith('+') && !stripped.startsWith('+353')) return trimmed;

  // Pull out the pure digit sequence. Strip a leading + then optional
  // "353" country code, then an optional leading 0 (Irish local format).
  let digits = stripped.replace(/\+/g, '');
  if (digits.startsWith('353')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);

  // Irish subscriber numbers are 9 digits (sometimes 10 for certain
  // landline areas). Reject anything outside that band so we don't
  // silently mutate shorter test-entries or international numbers that
  // happened to not start with a +.
  if (digits.length < IRISH_LOCAL_LENGTH || digits.length > 10) return trimmed;

  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  return `+353 ${area} ${rest}`;
}
