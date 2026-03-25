
-- Community posts table
CREATE TABLE public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text DEFAULT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can view posts
CREATE POLICY "Anyone can view community posts" ON public.community_posts
  FOR SELECT TO public USING (true);

-- Only students can insert posts
CREATE POLICY "Students can create posts" ON public.community_posts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.user_type = 'student'
    )
  );

-- Users can delete own posts
CREATE POLICY "Users can delete own posts" ON public.community_posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Users can update own posts
CREATE POLICY "Users can update own posts" ON public.community_posts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Admins can delete any post
CREATE POLICY "Admins can delete any community post" ON public.community_posts
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));

-- Community post likes table
CREATE TABLE public.community_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can view likes
CREATE POLICY "Anyone can view likes" ON public.community_post_likes
  FOR SELECT TO public USING (true);

-- Auth users can like
CREATE POLICY "Auth users can like posts" ON public.community_post_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can unlike
CREATE POLICY "Users can unlike posts" ON public.community_post_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Function to increment/decrement likes count
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE community_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE community_posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER on_like_change
AFTER INSERT OR DELETE ON public.community_post_likes
FOR EACH ROW EXECUTE FUNCTION public.update_post_likes_count();
