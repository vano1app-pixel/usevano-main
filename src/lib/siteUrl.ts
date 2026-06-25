import { isNativeApp } from '@/lib/platform';

/** Production hostname — all public URLs and auth redirects should resolve here (see VITE_SITE_URL). */
export const SITE_ORIGIN_DEFAULT = 'https://vanojobs.com';

/**
 * Custom URL scheme the NATIVE app returns to after OAuth / magic-link.
 * Registered in ios/App/App/Info.plist (CFBundleURLTypes) and android's
 * AndroidManifest.xml (intent-filter); handled by the appUrlOpen listener in
 * src/lib/native/initNativeAuth.ts. This MUST be added to Supabase →
 * Authentication → URL Configuration → Redirect URLs, otherwise Supabase
 * refuses the redirect and native sign-in fails.
 */
export const NATIVE_AUTH_REDIRECT = 'com.vanojobs.app://auth-callback';

/** Force apex `vanojobs.com` so OAuth / redirects match Supabase URL config when env or DNS uses `www`. */
function normalizeVanojobsOrigin(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  u = u.replace(/^https?:\/\/www\.vanojobs\.com(?=\/|$)/i, SITE_ORIGIN_DEFAULT);
  u = u.replace(/^http:\/\/vanojobs\.com(?=\/|$)/i, SITE_ORIGIN_DEFAULT);
  return u;
}

/**
 * Canonical public origin for the app: password-reset links, OG URLs, canonical tags.
 * - Set `VITE_SITE_URL` (or `VITE_AUTH_EMAIL_REDIRECT_URL`) to `https://vanojobs.com` in Vercel/production.
 * - On localhost, uses the current origin so dev reset-password links still work.
 */
export function getSiteOrigin(): string {
  const fromEnv =
    (import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/+$/, '') ||
    (import.meta.env.VITE_AUTH_EMAIL_REDIRECT_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (fromEnv) return normalizeVanojobsOrigin(fromEnv);

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return origin;
    }
    if (hostname === 'www.vanojobs.com' || hostname === 'vanojobs.com') {
      return SITE_ORIGIN_DEFAULT;
    }
  }

  return SITE_ORIGIN_DEFAULT;
}

/**
 * Auth redirect for both `signInWithOAuth({ options: { redirectTo } })` and
 * `signInWithOtp({ options: { emailRedirectTo } })`. Must match a URL in
 * Supabase → Authentication → URL Configuration → Redirect URLs.
 * Production: `https://vanojobs.com` (site root; session is restored from the URL hash on load).
 *
 * Native (Capacitor) app: returns the custom URL scheme instead, so OAuth and
 * magic-link round-trips re-enter the app rather than the website. The web
 * behaviour below is unchanged — `isNativeApp()` is false on the web and in tests.
 */
export function getAuthRedirectUrl(): string {
  if (isNativeApp()) return NATIVE_AUTH_REDIRECT;
  return getSiteOrigin();
}


/** Full URL for the current path on the canonical origin (SEO / sharing). */
export function getCanonicalUrl(): string {
  if (typeof window === 'undefined') return `${SITE_ORIGIN_DEFAULT}/`;
  const path = `${window.location.pathname}${window.location.search}`;
  return `${getSiteOrigin()}${path}`;
}
