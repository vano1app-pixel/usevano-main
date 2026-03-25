
-- Add user_type to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS user_type text DEFAULT 'student' CHECK (user_type IN ('student', 'business'));

-- Create student_profiles table
CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  bio text DEFAULT '',
  skills text[] DEFAULT '{}',
  hourly_rate numeric DEFAULT 0,
  phone text DEFAULT '',
  avatar_url text DEFAULT '',
  is_available boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view available students" ON public.student_profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own student profile" ON public.student_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own student profile" ON public.student_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_student_profiles_updated_at
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create job_status enum
CREATE TYPE public.job_status AS ENUM ('open', 'filled', 'closed');

-- Create application_status enum  
CREATE TYPE public.application_status AS ENUM ('pending', 'accepted', 'rejected');

-- Create jobs table
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  hourly_rate numeric NOT NULL DEFAULT 0,
  tags text[] DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'open',
  shift_date date NOT NULL,
  shift_start time NOT NULL,
  shift_end time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view open jobs" ON public.jobs
  FOR SELECT USING (true);

CREATE POLICY "Auth users can insert jobs" ON public.jobs
  FOR INSERT WITH CHECK (auth.uid() = posted_by);

CREATE POLICY "Users can update own jobs" ON public.jobs
  FOR UPDATE USING (auth.uid() = posted_by);

CREATE POLICY "Users can delete own jobs" ON public.jobs
  FOR DELETE USING (auth.uid() = posted_by);

-- Create job_applications table
CREATE TABLE public.job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  message text DEFAULT '',
  status application_status NOT NULL DEFAULT 'pending',
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, student_id)
);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own applications" ON public.job_applications
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Job posters can view applications" ON public.job_applications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_applications.job_id AND jobs.posted_by = auth.uid())
  );

CREATE POLICY "Students can insert applications" ON public.job_applications
  FOR INSERT WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Job posters can update application status" ON public.job_applications
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = job_applications.job_id AND jobs.posted_by = auth.uid())
  );
