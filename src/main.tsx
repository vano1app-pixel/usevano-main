import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from 'react-helmet-async';
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";
// gsapSetup is intentionally NOT imported here. It pulls GSAP +
// ScrollTrigger + TextPlugin + Flip into the entry bundle (~150KB
// gzipped) but only HirePage's lazy chunk and a handful of animation
// hooks consume it — those modules import it directly so the work
// only happens on routes that need it.

window.googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

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
});
