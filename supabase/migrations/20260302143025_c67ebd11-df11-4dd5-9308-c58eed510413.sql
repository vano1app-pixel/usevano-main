
-- 1. Add UPDATE policy for conversations table
CREATE POLICY "Participants can update conversations"
ON public.conversations
FOR UPDATE
USING (auth.uid() = participant_1 OR auth.uid() = participant_2)
WITH CHECK (auth.uid() = participant_1 OR auth.uid() = participant_2);

-- 2. Drop permissive review INSERT policy and replace with stricter one
DROP POLICY IF EXISTS "Auth users can create reviews" ON public.reviews;

CREATE POLICY "Users can only review after working together"
ON public.reviews FOR INSERT
WITH CHECK (
  auth.uid() = reviewer_id AND
  reviewer_id != reviewee_id AND
  EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = job_id
    AND j.shift_date < CURRENT_DATE
    AND (
      (j.posted_by = reviewer_id AND EXISTS (
        SELECT 1 FROM job_applications
        WHERE job_id = j.id AND student_id = reviewee_id AND status = 'accepted'
      ))
      OR
      (j.posted_by = reviewee_id AND EXISTS (
        SELECT 1 FROM job_applications
        WHERE job_id = j.id AND student_id = reviewer_id AND status = 'accepted'
      ))
    )
  )
);
