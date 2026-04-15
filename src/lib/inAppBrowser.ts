/**
 * In-app browser detection + escape.
 *
 * Why this exists: Google OAuth throws a full-screen "Access blocked: Error
 * 403 disallowed_useragent" page when a user tries to sign in from inside an
 * embedded browser (Fiverr's, Instagram's, TikTok's, etc). We can't change
 * Google's enforcement — we can only route the user into their real browser
 * (Safari / Chrome) *before* they press the Google button.
 *
 * Detection is intentionally conservative — a false positive (banner shown
 * to someone on real Safari) is much worse than a false negative (banner
 * missed on some obscure in-app browser, user sees Google's 403).
 */

export type InAppBrowser =
  | 'instagram'
  | 'facebook'
  | 'messenger'
  | 'tiktok'
  | 'fiverr'
  | 'linkedin'
  | 'twitter'
  | 'snapchat'
  | 'whatsapp'
  | 'line'
  | 'pinterest'
  | 'generic';

/** Human-facing label for each browser key — used in banner copy. */
export const IN_APP_BROWSER_LABEL: Record<InAppBrowser, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  tiktok: 'TikTok',
  fiverr: 'Fiverr',
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  snapchat: 'Snapchat',
  whatsapp: 'WhatsApp',
  line: 'LINE',
  pinterest: 'Pinterest',
  generic: "this app's",
};

function getUA(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

/**
 * Identifies which in-app browser (if any) the user is in. Returns null on
 * a real browser (Safari, Chrome, Firefox, Edge, Samsung, etc).
 *
 * Order matters — specific apps are checked before the generic WebView
 * heuristic so a Facebook in-app browser doesn't get tagged 'generic'.
 */
export function detectInAppBrowser(): InAppBrowser | null {
  const ua = getUA();
  if (!ua) return null;

  if (/Instagram/i.test(ua)) return 'instagram';
  // FB tokens: FBAN (app name), FBAV (version), FB_IAB (in-app browser),
  // FBIOS, FB4A. Messenger uses its own FBAN=MESSENGER.
  if (/FBAN\/MessengerForiOS|Messenger/i.test(ua)) return 'messenger';
  if (/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(ua)) return 'facebook';
  if (/TikTok|BytedanceWebview|musical_ly|aweme/i.test(ua)) return 'tiktok';
  if (/Fiverr/i.test(ua)) return 'fiverr';
  if (/LinkedInApp/i.test(ua)) return 'linkedin';
  if (/Twitter(?:Android)?/i.test(ua)) return 'twitter';
  if (/Snapchat/i.test(ua)) return 'snapchat';
  if (/WhatsApp/i.test(ua)) return 'whatsapp';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/Pinterest/i.test(ua)) return 'pinterest';

  // Generic WebView detection — ONLY flag cases we're >95% sure about. Real
  // Safari always has "Safari/" in its UA; iOS WebViews don't. On Android,
  // WebViews carry the "; wv)" marker.
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const looksLikeIOSWebView = isIOS && !/Safari\//i.test(ua) && /AppleWebKit/i.test(ua);
  const looksLikeAndroidWebView = isAndroid && /;\s?wv\)/i.test(ua);
  if (looksLikeIOSWebView || looksLikeAndroidWebView) return 'generic';

  return null;
}

export function isInAppBrowser(): boolean {
  return detectInAppBrowser() !== null;
}

/**
 * Best-effort: force the current URL to open in the OS default browser.
 *
 * iOS: the old `x-safari-https://` deep-link was broken in iOS 17+. We try
 * it anyway as it still works on older iOS and some in-app browsers honour
 * it. The fallback is for the banner to tell the user to use the ⋯ menu.
 *
 * Android: `intent://…#Intent;scheme=https;package=com.android.chrome;end`
 * opens Chrome reliably in most WebViews we care about.
 */
export function openInExternalBrowser(): void {
  if (typeof window === 'undefined') return;
  const url = window.location.href;
  const ua = getUA();
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (isIOS) {
    const noScheme = url.replace(/^https?:\/\//, '');
    window.location.href = `x-safari-https://${noScheme}`;
    return;
  }
  if (isAndroid) {
    const noScheme = url.replace(/^https?:\/\//, '');
    window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }

  // Desktop / unknown — nothing sensible to do programmatically. The banner
  // will still show the URL so the user can copy it.
}

/** Copy the current page URL to clipboard. Returns true on success. */
export async function copyCurrentUrl(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  try {
    await navigator.clipboard.writeText(window.location.href);
    return true;
  } catch {
    return false;
  }
}
