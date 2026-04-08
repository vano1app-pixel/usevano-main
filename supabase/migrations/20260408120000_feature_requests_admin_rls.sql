-- Allow admins to view and delete feature requests from the admin panel
CREATE POLICY "Admins can view all feature requests"
  ON public.feature_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete feature requests"
  ON public.feature_requests
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
