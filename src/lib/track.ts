/**
 * In-house analytics with an optional PostHog mirror.
 *
 * Every event is written to the Supabase `analytics_events` table
 * (existing behaviour — admin-queryable via RLS) AND, when the
 * PostHog SDK is loaded, mirrored to `posthog.capture()` so the same
 * event lands in the PostHog dashboard for funnels / retention /
 * session-replay joins. The two sinks are independent — if either
 * fails the other still runs, and the caller never sees an error.
 *
 * - Fire-and-forget: never throws, never blocks UX.
 * - Resolves the current user_id from the active session (or NULL if anon).
 * - No PII beyond auth user_id is ever added automatically.
 *
 * Backed by the `analytics_events` table (migration 20260415130000_analytics_events.sql).
 */
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export type TrackEvent =
  | 'hire_step_viewed'
  | 'quote_sent'
  | 'direct_hire_sent'
  | 'listing_published'
  | 'freelancer_card_clicked'
  | 'vano_match_sent'
  | 'quote_broadcast_sent'
  | 'quote_broadcast_filled'
  | 'in_app_browser_blocked'
  | 'hire_agreement_created'
  | 'auth_magic_link_sent'
  | 'auth_magic_link_resent'
  | 'publish_failed'
  | 'ai_find_checkout_started'
  // Hero front-door instrumentation — which door actually converts (the tap
  // tiles + WhatsApp brought the first bookings; the search bar brought none,
  // which is why the tiles are back as the primary).
  | 'hero_tile_tap'
  | 'hero_sub_pick'
  // The one-tap sizing question (speed wizard, 2026-07-27): fired on answer
  // with { category, answer } — how big is the place/garden, what kind of
  // dog, how many bags. The funnel beat between tile/sub pick and ticks/form.
  | 'hero_size_pick'
  | 'hero_equip_pick'
  // Tick-box job builder (cleaning/garden/moving page 1): fired on Continue
  // with { category, tasks, size } — the funnel step between tile tap and
  // checkout submit for builder categories.
  | 'builder_continue'
  | 'hero_usual_tap'
  | 'hero_search_open'
  | 'hero_whatsapp_tap'
  // The end-of-page CTA band after the FAQ — measures how many readers the
  // long page persuades (its taps scroll back up to the hero tiles).
  | 'closing_cta_tap'
  // Post-rating Trustpilot ask on /track — shown only after a just-submitted
  // 4-5★ rating; the shown→tap funnel measures how many happy customers we
  // convert into public reviews.
  | 'trustpilot_ask_shown'
  | 'trustpilot_ask_tap'
  // Top-of-page follow buttons (nav + hero row) — props: { network }.
  | 'social_follow_tap';

export function track(event: TrackEvent, props: Record<string, unknown> = {}): void {
  // PostHog mirror — dynamic import keeps posthog-js out of the entry
  // bundle (it's ~50KB gzipped). main.tsx initialises PostHog during
  // requestIdleCallback so by the time a user clicks anything that calls
  // track(), the SDK is almost always already loaded; if not, the import
  // resolves first and capture() runs once it's available. Wrapped in
  // try/catch because PostHog throws when localStorage is blocked
  // (private-mode Safari) and analytics must never break the call site.
  if (import.meta.env.VITE_POSTHOG_KEY) {
    void import('posthog-js').then(({ default: posthog }) => {
      try {
        if (posthog.__loaded) posthog.capture(event, props);
      } catch {
        /* swallow */
      }
    }).catch(() => { /* swallow */ });
  }

  // Defer the Supabase insert so we never block the calling render/handler.
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      await (supabase as unknown as SupabaseClient)
        .from('analytics_events')
        .insert({ user_id: userId, event, props });
    } catch {
      /* swallow — analytics must never break the app */
    }
  })();
}
