-- Lightweight in-house funnel tracking. No PII beyond user_id (which is the
-- auth user already authenticated to Supabase), no third-party SDKs.
--
-- Read by admins only via the existing user_roles('admin') RLS pattern.
-- Insert is open to authenticated users for their own user_id, and to
-- anon users with user_id = NULL (e.g. a logged-out visitor on /hire).

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_event_created_idx
  ON public.analytics_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx
  ON public.analytics_events (user_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can insert their own event. user_id must match
-- the authenticated user, or be NULL for logged-out tracking.
DROP POLICY IF EXISTS "analytics_events_insert_self" ON public.analytics_events;
CREATE POLICY "analytics_events_insert_self"
  ON public.analytics_events
  FOR INSERT
  TO public
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
  );

-- Only admins can read events.
DROP POLICY IF EXISTS "analytics_events_select_admin" ON public.analytics_events;
CREATE POLICY "analytics_events_select_admin"
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'admin'
    )
  );

COMMENT ON TABLE public.analytics_events IS
  'In-house conversion funnel events (hire_step_viewed, quote_sent, direct_hire_sent, listing_published, freelancer_card_clicked).';
