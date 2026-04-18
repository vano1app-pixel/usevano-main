-- Realign community_posts categories with the frontend canonical ids.
--
-- Frontend (src/lib/communityCategories.ts) has always used
--   videography | digital_sales | websites | social_media
-- but the DB CHECK constraint was stuck at
--   videographer | websites | social_media
-- which (a) forced existing videographers into 'videographer' so the
-- AI Find exact-match filter for 'videography' silently missed them,
-- and (b) blocked anyone from ever listing as 'digital_sales'.
--
-- Applied live via MCP first; checking into the repo for history.

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

UPDATE public.community_posts
SET category = 'videography'
WHERE category = 'videographer';

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN ('videography', 'digital_sales', 'websites', 'social_media'));
