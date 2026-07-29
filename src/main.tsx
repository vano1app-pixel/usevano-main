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
      posthog.init(posthogKey, {
        api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com',
        capture_pageview: 'history_change',
        // Mask every input value in session recordings so bios, phone
        // numbers, and in-flight message drafts can't be replayed.
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

  // Google Analytics 4 — loaded here (deferred) rather than as a blocking
  // <script> in index.html, so it stays off the critical render path like
  // PostHog/Sentry. The VANO web stream is G-0LXN42G60M, hardcoded as the
  // production default (Measurement IDs are public, not secret) so GA works on
  // deploy with no Vercel config; VITE_GA_ID overrides it if ever needed. Gated
  // on PROD so `npm run dev` never sends hits to the live property. GA4's
  // Enhanced Measurement (on by default) captures SPA route changes, so no
  // manual page_view wiring is needed for basic analytics.
  const gaId = (import.meta.env.VITE_GA_ID as string | undefined)
    ?? (import.meta.env.PROD ? 'G-0LXN42G60M' : undefined);
  if (gaId) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(s);
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { w.dataLayer.push(arguments); };
    w.gtag('js', new Date());
    w.gtag('config', gaId);
  }
});
