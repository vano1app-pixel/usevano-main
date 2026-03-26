-- Allow admins to edit freelancer profiles when reviewing Community listings
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update any student profile" ON public.student_profiles;
CREATE POLICY "Admins can update any student profile"
  ON public.student_profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins may upload avatars/banners on behalf of users (path = user_id/...)
DROP POLICY IF EXISTS "Admins can upload avatars for any user" ON storage.objects;
CREATE POLICY "Admins can upload avatars for any user"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update avatars for any user"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete avatars for any user" ON storage.objects;
CREATE POLICY "Admins can delete avatars for any user"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'admin'));
