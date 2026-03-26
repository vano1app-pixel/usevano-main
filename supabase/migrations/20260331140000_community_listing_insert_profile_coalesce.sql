-- Allow Community listing requests when profiles.user_type was never set (legacy rows default to student in app logic)
DROP POLICY IF EXISTS "Students insert own listing requests" ON public.community_listing_requests;

CREATE POLICY "Students insert own listing requests"
  ON public.community_listing_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND COALESCE(p.user_type, 'student') = 'student'
    )
  );
