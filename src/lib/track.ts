/**
 * Minimal in-house analytics. Inserts an event row into `analytics_events`.
 *
 * - Fire-and-forget: never throws, never blocks UX.
 * - Resolves the current user_id from the active session (or NULL if anon).
 * - No third-party SDK, no PII beyond auth user_id.
 *
 * Backed by the `analytics_events` table (migration 20260415130000_analytics_events.sql).
 * Read access is admin-only via RLS.
 */
import { supabase } from '@/integrations/supabase/client';

export type TrackEvent =
  | 'hire_step_viewed'
  | 'quote_sent'
  | 'direct_hire_sent'
  | 'listing_published'
  | 'freelancer_card_clicked'
  | 'vano_match_sent'
  | 'quote_broadcast_sent'
  | 'quote_broadcast_filled';

export function track(event: TrackEvent, props: Record<string, unknown> = {}): void {
  // Defer so we never block the calling render/handler.
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;
      await supabase
        .from('analytics_events' as any)
        .insert({ user_id: userId, event, props } as any);
    } catch {
      /* swallow — analytics must never break the app */
    }
  })();
}
