/**
 * In-house analytics. ONE sink: the Supabase `analytics_events` table.
 *
 * Every event is written there (admin-queryable via RLS) and nowhere else.
 * There WAS a PostHog mirror; it was removed 2026-08-27 when PostHog was
 * narrowed to session replay only (see main.tsx). This table is the source
 * of truth for the funnel — the 60-day drop-off analysis that prompted the
 * callback-capture rebuild was read straight out of it.
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
  /** WAITLIST_MODE: someone wanted a job we couldn't cover. The demand
   *  signal that says where to recruit helpers next. */
  | 'waitlist_request'
  | 'waitlist_whatsapp'
  | 'hero_usual_tap'
  | 'hero_search_open'
  | 'hero_whatsapp_tap'
  // General-help front door (2026-09): the "Send someone" field opens the
  // booking sheet on a custom job — props { rooms, timing, typed } / speak-book
  // adds { source, jobKey, hours, tools }. `_parse` fires when a spoken/typed
  // sentence is understood — props { source, jobKey, confidence }.
  | 'hero_general_help_submit'
  | 'hero_general_help_parse'
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
  // NO PostHog mirror (owner call 2026-08-27). PostHog is here for SESSION
  // REPLAY ONLY — main.tsx turns off autocapture, pageviews and pageleaves
  // for the same reason. Every event below is already written to the
  // `analytics_events` table, which is the source of truth for the funnel
  // (it's what the 60-day drop-off analysis was read from), so mirroring
  // them into PostHog bought a second, thinner copy of numbers we already
  // have and nothing else.
  //
  // The events are deliberately NOT lost: the Supabase insert below is
  // unchanged. If PostHog funnels are ever wanted, restore the dynamic
  // import + posthog.capture(event, props) here — the SDK is still loaded
  // by main.tsx, so it's a re-add, not a rebuild.

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
