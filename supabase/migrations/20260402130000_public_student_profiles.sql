-- Allow unauthenticated visitors to view approved student profiles
-- This enables browsing freelancers before signup (for SEO / first impression)

DROP POLICY IF EXISTS "Authenticated users can view student profiles" ON public.student_profiles;

CREATE POLICY "Anyone can view approved student profiles"
ON public.student_profiles
FOR SELECT
TO anon, authenticated
USING (community_board_status = 'approved');
