import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from 'react-helmet-async';
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { getSupabaseUrl } from "@/lib/supabaseEnv";
import "./index.css";

window.googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Warm the Supabase connection (DNS + TLS handshake) before the first query
// fires from a React effect, so the homepage's helper count / reviews / ticker
// data arrives a beat sooner. No-ops if the URL isn't configured.
(() => {
  const url = getSupabaseUrl();
  if (!url) return;
  try {
    const { origin } = new URL(url);
    for (const rel of ['preconnect', 'dns-prefetch']) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch {
    /* malformed URL — skip */
  }
})();

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// PostHog + Sentry are deferred to an idle callback after first paint.
// Both SDKs are large (Sentry + browserTracing + posthog-js together
// add ~80–120KB gzipped to the entry bundle when imported statically).
// Initialising them post-mount keeps them out of the critical path; any
// error thrown during initial render is still caught by the React
// ErrorBoundary above (which logs to console), and Sentry's late init
// will catch every subsequent error including unhandledrejection from
// in-flight promises that resolve after init.
//
// Guarded by env vars: without the keys both branches no-op so dev
// boxes and CI don't spam the production projects.
function deferToIdle(fn: () => void) {
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 1);
  }
}

deferToIdle(() => {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (posthogKey) {
    void import('posthog-js').then(({ default: posthog }) => {
      // SESSION REPLAY ONLY (owner call 2026-08-27). The analytics_events
      // table in Supabase is already the event sink and the source of truth
      // for the funnel — PostHog is here to WATCH a session, not to count
      // one. So every capture path is off and recording is explicitly on.
      posthog.init(posthogKey, {
        // EU project (257745). The INGEST host is eu.i.posthog.com — note the
        // `i.`; eu.posthog.com is the dashboard and will not accept events.
        // Defaulting to EU rather than US so a missing VITE_POSTHOG_HOST
        // can't silently ship recordings to the wrong region, where they
        // simply never appear.
        api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://eu.i.posthog.com',
        // No event capture: no clicks/inputs harvested automatically, and no
        // pageview events. track.ts still sends its OWN named events (see the
        // note there) — this only stops PostHog inventing extras.
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        // The one thing we DO want, stated explicitly rather than left to the
        // project default so it can't be turned off from the dashboard by
        // accident.
        disable_session_recording: false,
        // Mask every input value in session recordings so bios, phone
        // numbers, and in-flight message drafts can't be replayed. The
        // booking sheet collects a phone and an address — this is the line
        // that keeps replay on the right side of the privacy policy, which
        // promises exactly this (src/pages/Privacy.tsx §7). Never remove it.
        session_recording: { maskAllInputs: true },
        respect_dnt: true,
        persistence: 'localStorage+cookie',
      });
    });
  }

  const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (sentryDsn) {
    void import('@sentry/react').then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        integrations: [Sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
        ignoreErrors: [
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          'Non-Error promise rejection captured',
        ],
        denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
      });
    });
  }
});
