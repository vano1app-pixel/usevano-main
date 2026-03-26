/** Production hostname — all public URLs and auth redirects should resolve here (see VITE_SITE_URL). */
export const SITE_ORIGIN_DEFAULT = 'https://vanojobs.com';

/**
 * Canonical public origin for the app: password-reset links, OG URLs, canonical tags.
 * - Set `VITE_SITE_URL` (or `VITE_AUTH_EMAIL_REDIRECT_URL`) to `https://vanojobs.com` in Vercel/production.
 * - On localhost, uses the current origin so dev reset-password links still work.
 */
export function getSiteOrigin(): string {
  const fromEnv =
    (import.meta.env.VITE_SITE_URL as string | undefined)?.trim().replace(/\/+$/, '') ||
    (import.meta.env.VITE_AUTH_EMAIL_REDIRECT_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      return origin;
    }
  }

  return SITE_ORIGIN_DEFAULT;
}

/**
 * `signInWithOAuth({ options: { redirectTo } })` must match a URL in Supabase → Authentication → URL Configuration → Redirect URLs.
 * Production: `https://vanojobs.com` (site root; session is restored from the URL hash on load).
 */
export function getGoogleOAuthRedirectUrl(): string {
  return getSiteOrigin();
}

/** Full URL for the current path on the canonical origin (SEO / sharing). */
export function getCanonicalUrl(): string {
  if (typeof window === 'undefined') return `${SITE_ORIGIN_DEFAULT}/`;
  const path = `${window.location.pathname}${window.location.search}`;
  return `${getSiteOrigin()}${path}`;
}
