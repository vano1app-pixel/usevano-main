import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from 'react-helmet-async';
import posthog from 'posthog-js';
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
