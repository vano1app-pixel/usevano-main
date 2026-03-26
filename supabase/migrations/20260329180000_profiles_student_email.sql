-- Verified institutional email stored on profile (auth email may differ e.g. Google + separate student address)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_email text;

COMMENT ON COLUMN public.profiles.student_email IS 'Verified .ac.ie / .atu.ie / .lit.ie email for freelancer accounts';
