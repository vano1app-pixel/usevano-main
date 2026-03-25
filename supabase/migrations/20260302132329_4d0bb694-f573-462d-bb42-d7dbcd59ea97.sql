
-- Saved jobs (students bookmark jobs)
CREATE TABLE public.saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_id)
);
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved jobs" ON public.saved_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can save jobs" ON public.saved_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unsave jobs" ON public.saved_jobs FOR DELETE USING (auth.uid() = user_id);

-- Favourite students (businesses bookmark students)
CREATE TABLE public.favourite_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_user_id uuid NOT NULL,
  student_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_user_id, student_user_id)
);
ALTER TABLE public.favourite_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own favourites" ON public.favourite_students FOR SELECT USING (auth.uid() = business_user_id);
CREATE POLICY "Users can add favourites" ON public.favourite_students FOR INSERT WITH CHECK (auth.uid() = business_user_id);
CREATE POLICY "Users can remove favourites" ON public.favourite_students FOR DELETE USING (auth.uid() = business_user_id);
