-- Add optional LinkedIn profile URL to student_profiles.
-- Shown on the public profile alongside TikTok; primary surface for digital_sales
-- reps where LinkedIn credibility matters more than TikTok presence.

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

COMMENT ON COLUMN public.student_profiles.linkedin_url IS
  'Optional LinkedIn profile URL; surfaces on public profile for all categories, prompted in the wizard for digital_sales.';
