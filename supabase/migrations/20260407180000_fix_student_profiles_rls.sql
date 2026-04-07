-- Fix RLS policies on student_profiles so upsert works correctly.
-- The UPDATE policy was missing WITH CHECK, causing 42501 on upsert.

DROP POLICY IF EXISTS "Users can update own student profile" ON public.student_profiles;
DROP POLICY IF EXISTS "Users can insert own student profile" ON public.student_profiles;

CREATE POLICY "Users can update own student profile"
  ON public.student_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own student profile"
  ON public.student_profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
