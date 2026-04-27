import { lazy, type ComponentType } from 'react';

/**
 * Wrapper around React.lazy() that auto-recovers from stale chunk URLs.
 *
 * The bug we're fixing: vite emits content-hashed filenames for every
 * code-split chunk. When a user keeps a tab open across a deploy (or
 * has a service worker that cached the old HTML), the document still
 * references the OLD chunk filenames. Tapping a lazy route triggers
 * `import('/assets/Messages-abc123.js')` which 404s on the CDN because
 * the new deploy only ships `Messages-def456.js`.
 *
 * The dynamic import rejects with `Failed to fetch dynamically imported
 * module` (Chrome/Edge) or `Importing a module script failed` (Safari)
 * or `Unable to preload CSS for /...` (Firefox during preload). React's
 * Suspense surfaces the rejection to the nearest error boundary, which
 * in App.tsx is RouteErrorBoundary.
 *
 * Symptom: user sees the route boundary's fallback on Talent / Messages
 * / Dashboard / Hire (every lazy route). Landing isn't affected because
 * it's eager — its code is in the entry bundle whose URL is in the HTML.
 *
 * Fix: catch the chunk-load error inside the lazy factory and force a
 * single hard reload. The new HTML the browser fetches references the
 * NEW chunk URLs, the user lands on the page they wanted, and there's
 * no visible error UI.
 *
 * Loop guard: `sessionStorage` records that we've already reloaded once
 * this session. If the import fails AGAIN after a reload (i.e. the new
 * deploy is genuinely broken — chunk missing, network is dead, etc),
 * we re-throw so the error boundary surfaces it instead of reloading
 * forever.
 */

const RELOAD_KEY = 'vano_chunk_reload_attempted_v1';

export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    // Chrome / Edge / Node module loader
    m.includes('failed to fetch dynamically imported module') ||
    // Safari
    m.includes('importing a module script failed') ||
    m.includes('unable to load script') ||
    // Firefox during preload
    m.includes('unable to preload css') ||
    // Webpack-style error (unused with Vite but cheap to keep)
    m.includes('loading chunk') ||
    m.includes('loading css chunk')
  );
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(() =>
    factory().catch((err) => {
      if (!isChunkLoadError(err) || typeof window === 'undefined') throw err;

      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
      } catch {
        // sessionStorage blocked (private mode Safari, third-party iframe).
        // Without it we can't loop-guard, so don't auto-reload — let the
        // error boundary surface a friendly fallback instead.
        throw err;
      }
      if (alreadyReloaded) {
        // Tried once already, the new deploy is genuinely broken. Surface
        // the error so the boundary's reload button gives the user agency.
        throw err;
      }
      try {
        sessionStorage.setItem(RELOAD_KEY, '1');
      } catch {
        throw err;
      }
      window.location.reload();
      // The reload races React's render — return a never-resolving thenable
      // so Suspense keeps showing its fallback until the page actually
      // navigates away. (Throwing here would defeat the purpose.)
      return new Promise<{ default: T }>(() => { /* never resolves */ });
    }),
  );
}

/**
 * Call this on a successful page render to clear the reload-attempted
 * flag, so a future stale-chunk failure can recover the same way. Without
 * this, the second deploy in the same browser session would skip the
 * auto-reload and surface the error boundary instead.
 */
export function markChunkLoadRecovered(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}
