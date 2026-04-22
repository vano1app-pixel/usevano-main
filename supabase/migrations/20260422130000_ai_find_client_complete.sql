-- Allow the requester to complete their own ai_find_requests row
-- client-side. Needed because the ai-find-freelancer edge function
-- has been failing intermittently (gateway 401 / Gemini timeouts),
-- leaving paying hirers staring at a forever-loading screen with no
-- match. The client now does a simple category-based match against
-- community_posts and writes the result directly.
--
-- The policy is deliberately narrow:
--   - requester_id must equal auth.uid() on both sides (can't touch
--     other people's rows or reassign ownership)
--   - the row must currently be in a non-terminal state — clients can
--     promote awaiting_payment / paid / scouting → complete, but they
--     can't undo a completed/refunded/failed row
--   - the new row must be 'complete' with a vano_match_user_id set —
--     no flipping to other statuses, no clearing the match
--
-- Why not also gate on stripe_session_id? Because the webhook may not
-- have stamped it yet (the same outage that made client completion
-- necessary in the first place). The hirer is already authenticated
-- and owns the row; the worst-case abuse is a free "match" against
-- public freelancer profiles that are already visible on /freelancer/:id.

DROP POLICY IF EXISTS "ai_find_requests_update_requester_complete" ON public.ai_find_requests;
CREATE POLICY "ai_find_requests_update_requester_complete"
  ON public.ai_find_requests
  FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    AND status IN ('awaiting_payment', 'paid', 'scouting')
  )
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'complete'
    AND vano_match_user_id IS NOT NULL
  );
