-- Server-side backup for the ListOnCommunity wizard draft.
--
-- Context: the wizard already persists its in-progress state to
-- localStorage on every keystroke, which works great for a single-device
-- session. It falls over the moment a freelancer fills Step 1 on mobile
-- then switches to desktop — the draft is device-local only, so the
-- desktop lands on a blank form and they start from zero.
--
-- This table mirrors the same JSON blob the wizard already writes to
-- localStorage, keyed by user_id. The client treats localStorage as the
-- source of truth on mount (so existing users are unaffected); the
-- server row is only consulted when localStorage is empty AND the server
-- row is fresh (<7 days). On publish, the client clears both sides.
--
-- Purely additive — no other code paths read this table, and drafts are
-- never promoted to student_profiles until the user hits Publish through
-- the existing wizard flow.

CREATE TABLE IF NOT EXISTS public.freelancer_wizard_drafts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.freelancer_wizard_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freelancer_wizard_drafts_select_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_select_own"
  ON public.freelancer_wizard_drafts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "freelancer_wizard_drafts_upsert_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_upsert_own"
  ON public.freelancer_wizard_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "freelancer_wizard_drafts_update_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_update_own"
  ON public.freelancer_wizard_drafts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "freelancer_wizard_drafts_delete_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_delete_own"
  ON public.freelancer_wizard_drafts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.freelancer_wizard_drafts_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS freelancer_wizard_drafts_touch ON public.freelancer_wizard_drafts;
CREATE TRIGGER freelancer_wizard_drafts_touch
  BEFORE UPDATE ON public.freelancer_wizard_drafts
  FOR EACH ROW EXECUTE FUNCTION public.freelancer_wizard_drafts_touch();
