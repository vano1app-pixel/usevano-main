-- Allow students to insert community posts with any moderation_status.
-- The wizard publishes listings as 'approved' (no moderation queue).

DROP POLICY IF EXISTS "Students can create pending community posts" ON public.community_posts;
DROP POLICY IF EXISTS "Students can create community posts" ON public.community_posts;

CREATE POLICY "Students can create community posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.user_type = 'student')
  );
