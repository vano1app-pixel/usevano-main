-- ============================================================
-- SECURITY HARDENING V2
-- ============================================================

-- 1. FIX community_posts INSERT — force moderation_status to 'pending'
--    Prevents users from self-approving posts via direct API calls.
-- ============================================================
DROP POLICY IF EXISTS "Students can create community posts" ON public.community_posts;

CREATE POLICY "Students can create community posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND moderation_status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.user_type = 'student'
    )
  );


-- 2. FIX hire_requests — add admin policies for managing requests
-- ============================================================
CREATE POLICY "Admins can view all hire requests"
  ON public.hire_requests FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update hire requests"
  ON public.hire_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete hire requests"
  ON public.hire_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- 3. FIX notifications — ensure users can only update their OWN notifications
--    (policy may already exist from security_hardening v1, but ensure it's tight)
-- ============================================================
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
