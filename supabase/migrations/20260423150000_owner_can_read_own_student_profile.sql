-- Fix: freelancer QuickStart publish fails with
--   "new row violates row-level security policy (USING expression) for table student_profiles"
--
-- Root cause. ChooseAccountType creates the student_profiles row at signup
-- with community_board_status = NULL (default). The only SELECT policy in
-- place is 20260402130000_public_student_profiles:
--     USING (community_board_status = 'approved')
-- which makes that freshly-created row invisible to its own owner. PostgREST's
-- .upsert(..., { onConflict: 'user_id' }) translates to
--     INSERT ... ON CONFLICT (user_id) DO UPDATE ...
-- and Postgres requires the conflicting target row to be visible to the
-- caller via the SELECT USING clause before the UPDATE branch can run. Since
-- the row is hidden, Postgres rejects the whole statement with the USING-
-- expression RLS error. The publish never lands, so the freelancer never
-- appears on the talent board.
--
-- This same invisibility also silently broke Profile.tsx's "read my own
-- profile" query and every self-write upsert (banner_url, etc.) for anyone
-- not yet approved.
--
-- Fix: add a permissive SELECT policy scoped to the owner. Permissive
-- SELECT policies OR together, so public visitors keep seeing only approved
-- rows; the owner simply gains visibility of their own row regardless of
-- approval state, which is what every self-read/self-write code path in the
-- app already assumed.

CREATE POLICY "Users can view own student profile"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
