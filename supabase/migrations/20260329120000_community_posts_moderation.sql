-- Moderation: only approved posts are visible to the public on Community.
-- Direct student posts default to pending until approved in the Supabase dashboard or via admin flow.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS moderation_status text;

UPDATE public.community_posts SET moderation_status = 'approved' WHERE moderation_status IS NULL;

ALTER TABLE public.community_posts
  ALTER COLUMN moderation_status SET DEFAULT 'pending';

ALTER TABLE public.community_posts
  ALTER COLUMN moderation_status SET NOT NULL;

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_moderation_status_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_moderation_status_check
  CHECK (moderation_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.community_posts.moderation_status IS
  'pending | approved | rejected. Public sees approved only; authors and admins see their pending/rejected rows.';

-- Replace public read policy
DROP POLICY IF EXISTS "Anyone can view community posts" ON public.community_posts;

CREATE POLICY "View approved community posts or own or admin"
  ON public.community_posts FOR SELECT TO public
  USING (
    moderation_status = 'approved'
    OR (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'))
  );

-- Students create pending posts only (quick-create dialog); mods approve in Table Editor or Admin
DROP POLICY IF EXISTS "Students can create posts" ON public.community_posts;

CREATE POLICY "Students can create pending community posts"
  ON public.community_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.user_id = auth.uid() AND profiles.user_type = 'student'
    )
    AND moderation_status = 'pending'
  );

-- Freelancer profile submission status (wizard sets pending; approve RPC sets approved)
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS community_board_status text;

ALTER TABLE public.student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_community_board_status_check;

ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_community_board_status_check
  CHECK (
    community_board_status IS NULL
    OR community_board_status IN ('pending', 'approved', 'rejected')
  );

COMMENT ON COLUMN public.student_profiles.community_board_status IS
  'pending: submitted for Community board review; approved: listing live; rejected: declined; NULL: never submitted.';

-- Approve listing → community post is visible to everyone
CREATE OR REPLACE FUNCTION public.approve_community_listing_request(_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.community_listing_requests%ROWTYPE;
  new_post_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO r
  FROM public.community_listing_requests
  WHERE id = _request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found or already processed';
  END IF;

  INSERT INTO public.community_posts (
    user_id,
    category,
    title,
    description,
    image_url,
    rate_min,
    rate_max,
    rate_unit,
    moderation_status
  ) VALUES (
    r.user_id,
    r.category,
    r.title,
    r.description,
    r.image_url,
    r.rate_min,
    r.rate_max,
    r.rate_unit,
    'approved'
  )
  RETURNING id INTO new_post_id;

  UPDATE public.community_listing_requests
  SET status = 'approved', reviewed_at = now()
  WHERE id = _request_id;

  UPDATE public.student_profiles
  SET community_board_status = 'approved'
  WHERE user_id = r.user_id;

  RETURN new_post_id;
END;
$$;

-- Reject listing → mark student profile row for visibility in dashboard / future UX
CREATE OR REPLACE FUNCTION public.reject_community_listing_request(_request_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT user_id INTO uid
  FROM public.community_listing_requests
  WHERE id = _request_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found or already processed';
  END IF;

  UPDATE public.community_listing_requests
  SET status = 'rejected', reviewed_at = now(), reviewer_note = COALESCE(_note, reviewer_note)
  WHERE id = _request_id;

  UPDATE public.student_profiles
  SET community_board_status = 'rejected'
  WHERE user_id = uid;
END;
$$;
