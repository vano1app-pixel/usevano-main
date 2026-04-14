-- Instagram, LinkedIn, and a generic portfolio/website URL for freelancers.
-- TikTok already lives on student_profiles (see 20260327120000_student_portfolio_links.sql);
-- this fills out the rest of the socials surfaced on the public profile + talent-board card.
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url  text,
  ADD COLUMN IF NOT EXISTS website_url   text;

COMMENT ON COLUMN public.student_profiles.instagram_url IS 'Public Instagram URL — normalised to https://www.instagram.com/{handle} on write.';
COMMENT ON COLUMN public.student_profiles.linkedin_url  IS 'Public LinkedIn profile URL (must be on linkedin.com).';
COMMENT ON COLUMN public.student_profiles.website_url   IS 'Generic portfolio/personal site URL.';
