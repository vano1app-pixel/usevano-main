-- Fix profiles UPDATE RLS policy — add WITH CHECK clause.
-- Without it, new users can't update their own profile (42501 permission denied).

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
