
ALTER TABLE public.student_profiles ADD COLUMN student_verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.student_profiles ADD COLUMN verified_email text;
