
-- Remove the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view available students" ON public.student_profiles;

-- Replace with authenticated-only access
CREATE POLICY "Authenticated users can view student profiles"
ON public.student_profiles
FOR SELECT
TO authenticated
USING (true);
