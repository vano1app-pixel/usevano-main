
-- Add urgent flag and coordinates to jobs
ALTER TABLE public.jobs ADD COLUMN is_urgent boolean NOT NULL DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN latitude numeric NULL;
ALTER TABLE public.jobs ADD COLUMN longitude numeric NULL;

-- Student achievements table
CREATE TABLE public.student_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_key text NOT NULL,
  badge_label text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_key)
);
ALTER TABLE public.student_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievements" ON public.student_achievements FOR SELECT USING (true);
CREATE POLICY "System can insert achievements" ON public.student_achievements FOR INSERT WITH CHECK (true);
