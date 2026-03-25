-- Optional budget / rate fields for community listings (marketplace-style cards)
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS rate_min numeric,
  ADD COLUMN IF NOT EXISTS rate_max numeric,
  ADD COLUMN IF NOT EXISTS rate_unit text;

COMMENT ON COLUMN public.community_posts.rate_unit IS 'hourly, day, project, or negotiable';
