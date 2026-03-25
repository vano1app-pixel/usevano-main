
-- Add payment details to student_profiles (encrypted-at-rest by Supabase)
ALTER TABLE public.student_profiles ADD COLUMN payment_details text DEFAULT '';

-- Add agreement and payment tracking to job_applications
ALTER TABLE public.job_applications ADD COLUMN business_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_applications ADD COLUMN student_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_applications ADD COLUMN payment_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.job_applications ADD COLUMN confirmed_at timestamptz;
ALTER TABLE public.job_applications ADD COLUMN paid_at timestamptz;
