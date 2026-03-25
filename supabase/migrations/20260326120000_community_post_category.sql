-- Community board lanes: videographer, websites, social media
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'social_media';

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN ('videographer', 'websites', 'social_media'));

COMMENT ON COLUMN public.community_posts.category IS 'Board: videographer | websites | social_media';
