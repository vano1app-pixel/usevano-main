-- Any authenticated user may submit a listing request (profiles.user_type may be NULL; no student-only EXISTS check).
-- Require user_id = auth.uid() so clients cannot spoof another user's row (auth.uid() IS NOT NULL alone would allow that).
DROP POLICY IF EXISTS "Students insert own listing requests" ON public.community_listing_requests;
DROP POLICY IF EXISTS "Allow authenticated insert" ON public.community_listing_requests;

CREATE POLICY "Allow authenticated insert"
  ON public.community_listing_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);
