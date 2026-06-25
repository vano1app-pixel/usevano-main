import { isNativeApp } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';

let registered = false;

/**
 * Finishes OAuth / magic-link sign-in INSIDE the native app.
 *
 * On the web, Supabase's `detectSessionInUrl` turns the `?code=` (or `#token`)
 * on the return URL into a session automatically on page load. Native apps
 * never get that page load — the return trip arrives as a custom-scheme deep
 * link (com.vanojobs.app://auth-callback?code=…) routed to us by the OS. This
 * listener does the same job by hand, then drops the user at `/` so the shared
 * AuthProvider + route guards take over exactly as they do after a web sign-in.
 *
 * No-op on the web. Idempotent.
 */
export async function initNativeAuth(): Promise<void> {
  if (registered || !isNativeApp()) return;
  registered = true;

  const { App } = await import('@capacitor/app');

  await App.addListener('appUrlOpen', async ({ url }) => {
    // Only our auth return trip — ignore any other deep links.
    if (!url || !url.includes('auth-callback')) return;

    // Dismiss the in-app browser we opened for OAuth (no-op for magic-link).
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    } catch {
      /* nothing open */
    }

    try {
      await completeSignInFromUrl(url);
      // Full navigation re-bootstraps the app with the new session in storage;
      // Capacitor serves index.html for the SPA route and the guards route on.
      window.location.assign('/');
    } catch (e) {
      console.error('[native auth] could not complete sign-in from deep link', e);
    }
  });
}

/** Read a query param from a (possibly custom-scheme) URL, with a regex fallback. */
function readParam(url: string, key: string): string | null {
  try {
    const v = new URL(url).searchParams.get(key);
    if (v) return v;
  } catch {
    /* custom schemes can parse as opaque — fall through to regex */
  }
  const m = url.match(new RegExp(`[?&]${key}=([^&#]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function completeSignInFromUrl(url: string): Promise<void> {
  // PKCE flow (this project uses flowType: 'pkce'): exchange the code. The
  // code_verifier was stored in this app's localStorage when sign-in started,
  // so the exchange succeeds on the same device.
  const code = readParam(url, 'code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  // Defensive fallback: some configs return tokens in the URL fragment.
  const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const frag = new URLSearchParams(hash);
  const access_token = frag.get('access_token');
  const refresh_token = frag.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    return;
  }

  throw new Error('auth-callback deep link carried neither a code nor tokens');
}
