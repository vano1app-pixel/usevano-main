
-- Auto-assign admin role for specific emails on signup
CREATE OR REPLACE FUNCTION public.auto_assign_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(NEW.email) IN ('manoj7ar@gmail.com', 'ayushpuri1239@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_assign_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_admin();

-- Admin can delete any job
CREATE POLICY "Admins can delete any job"
ON public.jobs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update any job
CREATE POLICY "Admins can update any job"
ON public.jobs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete any profile
CREATE POLICY "Admins can delete any profile"
ON public.profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can update any profile
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete student profiles
CREATE POLICY "Admins can delete student profiles"
ON public.student_profiles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete reviews
CREATE POLICY "Admins can delete reviews"
ON public.reviews FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete job applications
CREATE POLICY "Admins can delete job applications"
ON public.job_applications FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete saved jobs
CREATE POLICY "Admins can delete saved jobs"
ON public.saved_jobs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete conversations
CREATE POLICY "Admins can delete conversations"
ON public.conversations FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete messages
CREATE POLICY "Admins can delete messages"
ON public.messages FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete portfolio items
CREATE POLICY "Admins can delete portfolio items"
ON public.portfolio_items FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete events
CREATE POLICY "Admins can delete events"
ON public.events FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Admin can delete notifications  
CREATE POLICY "Admins can delete notifications"
ON public.notifications FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
