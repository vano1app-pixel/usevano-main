-- Separate the combined 'videographer' category into 'videography' and 'photography'.
-- Existing posts that were filed under 'videographer' are migrated to 'videography'
-- (the closest match — motion/video work was the primary use of that category).

UPDATE public.community_posts
  SET category = 'videography'
  WHERE category = 'videographer';

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN ('videography', 'photography', 'websites', 'social_media'));

COMMENT ON COLUMN public.community_posts.category IS 'Board: videography | photography | websites | social_media';
