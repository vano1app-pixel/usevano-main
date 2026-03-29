-- ============================================================
-- SECURITY HARDENING MIGRATION
-- ============================================================

-- 1. FIX AUTO-ASSIGN ADMIN TRIGGER
--    Replace manoj7ar@gmail.com with vano1app@gmail.com.
--    Only vano1app@gmail.com and ayushpuri1239@gmail.com are admins.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_assign_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(NEW.email) IN ('vano1app@gmail.com', 'ayushpuri1239@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Remove admin role from manoj7ar@gmail.com if it exists
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id IN (
    SELECT id FROM auth.users WHERE lower(email) = 'manoj7ar@gmail.com'
  );

-- Ensure vano1app@gmail.com and ayushpuri1239@gmail.com have admin role
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE lower(email) IN ('vano1app@gmail.com', 'ayushpuri1239@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;


-- ============================================================
-- 2. FIX feature_requests — add SELECT and DELETE policies
-- ============================================================
CREATE POLICY "Users can view own feature requests"
  ON public.feature_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feature requests"
  ON public.feature_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can delete own feature requests"
  ON public.feature_requests
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any feature request"
  ON public.feature_requests
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));


-- ============================================================
-- 3. FIX community_listing_requests — add DELETE for users
-- ============================================================
CREATE POLICY "Users can delete own pending listing requests"
  ON public.community_listing_requests
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');


-- ============================================================
-- 4. FIX messages UPDATE — add WITH CHECK clause
--    Prevents a participant from changing sender_id or moving
--    the message to a different conversation.
-- ============================================================
DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;

CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );


-- ============================================================
-- 5. FIX notifications — add UPDATE policy so users can mark
--    their own notifications as read
-- ============================================================
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 6. FIX chat-images storage — enforce user-id folder on upload
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;

CREATE POLICY "Users can upload chat images to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 7. FIX community-images storage — enforce user-id folder on upload
-- ============================================================
DROP POLICY IF EXISTS "Auth users can upload community images" ON storage.objects;

CREATE POLICY "Users can upload community images to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- 8. FIX email-assets bucket — restrict write access to admins only
--    (public read remains, but only service role / admins can write)
-- ============================================================
CREATE POLICY "Only admins can upload email assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-assets'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Only admins can delete email assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-assets'
    AND public.has_role(auth.uid(), 'admin')
  );
