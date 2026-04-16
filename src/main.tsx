import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from 'react-helmet-async';
import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import "./index.css";
import "./lib/gsapSetup";

window.googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// PostHog analytics — product funnels, retention, session replay. The
// key is guarded: if the env var is missing (e.g. local dev without a
// .env.local or CI without secrets) the SDK no-ops entirely, so no
// accidental events ever fire from a dev box at production PostHog.
// All existing `track()` calls also still land in the Supabase
// `analytics_events` table, independent of whether PostHog loads.
const posthogKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com',
    // Auto-capture pageviews across react-router client-side navs.
    capture_pageview: 'history_change',
    // Mask every input value in session recordings so bios, phone
    // numbers, and in-flight message drafts can't be replayed. Text
    // outside inputs is still recorded so we can see what was shown.
    session_recording: {
      maskAllInputs: true,
    },
    respect_dnt: true,
    persistence: 'localStorage+cookie',
  });
}

// Sentry — automatic error + crash reporting. Same guard pattern as
// PostHog above: without VITE_SENTRY_DSN the SDK no-ops so dev boxes
// and CI don't spam the production Sentry project. The auth context
// attaches the Supabase user id to every event via Sentry.setUser()
// on login and clears it on logout.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // 10% of transactions — plenty at our traffic, trivially tunable.
    tracesSampleRate: 0.1,
    // No IP / cookie / user-agent by default; only the explicit user id
    // attached by the auth hook.
    sendDefaultPii: false,
    ignoreErrors: [
      // Benign Chrome quirk; not actionable.
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Non-Error throws — usually from third-party scripts, nothing
      // we can debug without a proper stack.
      'Non-Error promise rejection captured',
    ],
    denyUrls: [
      // User's own browser extensions — not Vano's problem.
      /extensions\//i,
      /^chrome:\/\//i,
      /^moz-extension:\/\//i,
    ],
  });
}

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
