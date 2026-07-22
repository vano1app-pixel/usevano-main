// A stable, anonymous per-device id — NOT PII, just a random token kept in
// localStorage so we can de-duplicate things "per person on this device"
// (currently: counting distinct opens of a partner's referral link without
// double-counting refreshes). Fail-soft: if storage is unavailable we return
// a fresh ephemeral id rather than throw, so callers never break.

const KEY = 'vano_visitor_id';

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `v-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const fresh = randomId();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage off — an ephemeral id is fine; it just won't
    // dedupe across visits, and the server's unique index is the backstop.
    return randomId();
  }
}
