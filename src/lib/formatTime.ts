/**
 * Single source of truth for displaying dates and timestamps.
 *
 * The codebase had drifted into a mix of `toLocaleDateString()` (browser
 * default), `toLocaleDateString('en-IE', ...)` (correct but verbose), raw
 * date-fns calls in chat, and bespoke countdown components. Same field
 * could render as "12 Apr 2026", "12/04/2026", "April 12", or "2 hours
 * ago" depending on which page you were on.
 *
 * One helper, one rule. Backend names stay; this only normalizes display.
 *
 *   formatTime(date, 'relative')  → "2h ago" / "in 30m"  (used for recent activity)
 *   formatTime(date, 'short')     → "12 Apr"             (used for tiles, lists)
 *   formatTime(date, 'long')      → "12 April 2026"      (used for receipts, audits)
 *   formatTime(date, 'datetime')  → "12 Apr · 14:30"     (used for messages, logs)
 *
 * `null`/`undefined`/invalid input renders as an em-dash so a missing
 * timestamp is visually distinct from "just now" — surfacing missing
 * data rather than papering over it.
 */

export type TimeFormat = 'relative' | 'short' | 'long' | 'datetime';

const LOCALE = 'en-IE';

function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatTime(
  input: Date | string | number | null | undefined,
  kind: TimeFormat = 'short',
): string {
  const d = toDate(input);
  if (!d) return '—';

  if (kind === 'relative') {
    const diffMs = d.getTime() - Date.now();
    const future = diffMs > 0;
    const abs = Math.abs(diffMs);
    const sec = Math.round(abs / 1000);
    if (sec < 60) return future ? 'in seconds' : 'just now';
    const min = Math.round(sec / 60);
    if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return future ? `in ${hr}h` : `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 7) return future ? `in ${day}d` : `${day}d ago`;
    // Beyond a week, fall through to a date — relative loses meaning fast.
    return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
  }

  if (kind === 'long') {
    return d.toLocaleDateString(LOCALE, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  if (kind === 'datetime') {
    const date = d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  }

  // 'short' — default.
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}
