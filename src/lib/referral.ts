/**
 * Give €5, get €5 — client side of the referral programme.
 *
 * A friend's link looks like vanojobs.com/?ref=7K3MQZ. We capture the code
 * once (first-touch attribution), keep it in localStorage, and send it with
 * checkout. The server does ALL validation — the code here only carries the
 * string and powers the "your friend gave you €5" banner.
 */

const KEY = 'vano_referral_v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90; // 90 days to convert

const CODE_RE = /^[A-Z0-9]{4,12}$/;

interface StoredReferral {
  code: string;
  at:   number;
}

/** Read ?ref= from the current URL and store it. Returns true when a new
 *  code was just captured (used to show the welcome banner). */
export function captureReferralFromUrl(): boolean {
  try {
    const raw = new URLSearchParams(window.location.search).get('ref');
    if (!raw) return false;
    const code = raw.trim().toUpperCase();
    if (!CODE_RE.test(code)) return false;
    if (getReferralCode()) return false; // first touch wins
    localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } satisfies StoredReferral));
    return true;
  } catch {
    return false;
  }
}

export function getReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReferral;
    if (!parsed?.code || !CODE_RE.test(parsed.code)) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > MAX_AGE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

export function clearReferralCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
