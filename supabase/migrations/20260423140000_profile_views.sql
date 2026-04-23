-- Profile view tracking — lightweight signal that drives retention on
-- the freelancer side. The "N views this week" card on /profile is a
-- cheap dopamine loop that gets freelancers coming back to update
-- their listing.
--
-- Design:
--   - One row per view, append-only. Good enough for <500 freelancers
--     at current scale; a weekly sweep can prune rows older than 90
--     days if the table ever grows.
--   - viewer_id is nullable so anon visitors count too (most profile
--     views come from signed-out hirers browsing). We accept the
--     abuse vector (someone could script inflation) because (a) it
--     only inflates their own count, nobody else's, and (b) the
--     RPC below skips self-views by authenticated viewers, which is
--     the one case where a freelancer could farm their own number.
--   - `record_profile_view` is SECURITY DEFINER so anon visitors can
--     call it. It's intentionally dumb — one INSERT, no dedupe by IP,
--     no rate limit. Keep it that way unless abuse becomes visible;
--     premature hardening cost us the counter working at all during
--     Stage 3 when we gated inserts behind a weekly unique constraint.

CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_views_viewed_user_id_viewed_at_idx
  ON public.profile_views (viewed_user_id, viewed_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Only the profile owner can read their view history. Protects who-
-- viewed-whom from leaking across users. Aggregate counts (what the
-- UI needs) go through this same policy with a head-count query, so
-- no separate privilege needed.
DROP POLICY IF EXISTS "profile_views_select_own" ON public.profile_views;
CREATE POLICY "profile_views_select_own"
  ON public.profile_views
  FOR SELECT
  TO authenticated
  USING (viewed_user_id = auth.uid());

-- No direct INSERT policy — inserts go through record_profile_view()
-- below so the self-view skip and viewer_id stamping are enforced
-- server-side rather than trusting every client.

CREATE OR REPLACE FUNCTION public.record_profile_view(_viewed_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
BEGIN
  IF _viewed_user_id IS NULL THEN
    RETURN;
  END IF;
  -- Self-views don't count. Without this a freelancer could sit on
  -- their own profile and watch the counter climb, which is both
  -- boring and misleading. Anon visitors (auth.uid() IS NULL) always
  -- count.
  IF _viewer IS NOT NULL AND _viewer = _viewed_user_id THEN
    RETURN;
  END IF;
  INSERT INTO public.profile_views (viewed_user_id, viewer_id)
  VALUES (_viewed_user_id, _viewer);
END
$$;

GRANT EXECUTE ON FUNCTION public.record_profile_view(uuid) TO anon, authenticated;
