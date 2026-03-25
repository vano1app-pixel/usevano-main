-- Drop the overly permissive insert policy on notifications
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

-- Create a restrictive policy: only service role can insert (no authenticated user can directly insert)
-- We use a false check so that anon/authenticated roles cannot insert; only service_role bypasses RLS
CREATE POLICY "Only service role can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (false);
