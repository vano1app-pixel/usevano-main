/**
 * Lazy Sentry shim. Static `import * as Sentry from '@sentry/react'` in
 * eagerly-loaded files (ErrorBoundary, RouteErrorBoundary, useAuthContext)
 * pulled the entire @sentry/react bundle (~60KB gzipped) onto the
 * critical path for first paint, even before Sentry.init() runs.
 *
 * This module exposes the only two Sentry methods the app actually
 * uses (captureException + setUser) and dynamically imports the SDK
 * the first time either is called. main.tsx schedules Sentry.init()
 * during requestIdleCallback after first paint; if an error fires
 * before init has resolved, the call is buffered and replayed.
 *
 * If VITE_SENTRY_DSN is missing the shim never imports the SDK at
 * all — keeping dev/CI builds clean.
 */

type CaptureExtra = {
  extra?: Record<string, unknown>;
  tags?: Record<string, string>;
};

type SentryUser = { id: string } | null;

type SentryModule = {
  captureException: (err: unknown, ctx?: CaptureExtra) => void;
  setUser: (user: SentryUser) => void;
};

let sentryPromise: Promise<SentryModule | null> | null = null;
const pendingExceptions: Array<[unknown, CaptureExtra | undefined]> = [];
let pendingUser: { value: SentryUser } | null = null;

function loadSentry(): Promise<SentryModule | null> {
  if (sentryPromise) return sentryPromise;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    sentryPromise = Promise.resolve(null);
    return sentryPromise;
  }
  sentryPromise = import('@sentry/react').then((m) => {
    const mod: SentryModule = {
      captureException: (err, ctx) => m.captureException(err as Error, ctx),
      setUser: (user) => m.setUser(user),
    };
    // Replay anything that fired before the SDK finished loading.
    while (pendingExceptions.length > 0) {
      const next = pendingExceptions.shift();
      if (next) mod.captureException(next[0], next[1]);
    }
    if (pendingUser) {
      mod.setUser(pendingUser.value);
      pendingUser = null;
    }
    return mod;
  }).catch(() => null);
  return sentryPromise;
}

export function captureException(err: unknown, ctx?: CaptureExtra): void {
  pendingExceptions.push([err, ctx]);
  void loadSentry().then((mod) => {
    if (!mod) {
      pendingExceptions.length = 0;
      return;
    }
    // Already replayed inside loadSentry's resolve — nothing else to do.
  });
}

export function setUser(user: SentryUser): void {
  pendingUser = { value: user };
  void loadSentry().then((mod) => {
    if (!mod) {
      pendingUser = null;
    }
  });
}

/**
 * Lazy PostHog identity helpers. Same shape as the Sentry shim above —
 * the SDK is dynamically imported on first call so the entry bundle
 * stays clean. main.tsx initialises PostHog during requestIdleCallback;
 * if identify/reset fire before init resolves, we just no-op (PostHog
 * captures pageview events automatically once init completes, and the
 * first identify will replay through the next call).
 */
export function identifyUser(id: string): void {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  void import('posthog-js').then(({ default: posthog }) => {
    try { if (posthog.__loaded) posthog.identify(id); } catch { /* ignore */ }
  });
}

export function resetUser(): void {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  void import('posthog-js').then(({ default: posthog }) => {
    try { if (posthog.__loaded) posthog.reset(); } catch { /* ignore */ }
  });
}
