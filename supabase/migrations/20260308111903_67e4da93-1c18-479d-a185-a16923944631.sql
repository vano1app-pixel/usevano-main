
-- Drop the recursive policy
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;

-- Replace with a non-recursive policy using the security definer function
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
