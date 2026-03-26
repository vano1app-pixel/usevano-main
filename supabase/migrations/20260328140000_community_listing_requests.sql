-- Freelancer community listings: submit for mod review before going live on the board
CREATE TABLE public.community_listing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  applicant_email text,
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  rate_min numeric,
  rate_max numeric,
  rate_unit text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone
);

CREATE INDEX community_listing_requests_status_idx ON public.community_listing_requests (status);
CREATE INDEX community_listing_requests_user_idx ON public.community_listing_requests (user_id);

ALTER TABLE public.community_listing_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students insert own listing requests"
  ON public.community_listing_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.user_type = 'student'
    )
  );

CREATE POLICY "Students view own listing requests"
  ON public.community_listing_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all listing requests"
  ON public.community_listing_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update listing requests"
  ON public.community_listing_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Approve: copy row into community_posts and mark request approved
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
    user_id, category, title, description, image_url, rate_min, rate_max, rate_unit
  ) VALUES (
    r.user_id, r.category, r.title, r.description, r.image_url, r.rate_min, r.rate_max, r.rate_unit
  )
  RETURNING id INTO new_post_id;

  UPDATE public.community_listing_requests
  SET status = 'approved', reviewed_at = now()
  WHERE id = _request_id;

  RETURN new_post_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_community_listing_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_community_listing_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_community_listing_request(_request_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.community_listing_requests
  SET status = 'rejected', reviewed_at = now(), reviewer_note = COALESCE(_note, reviewer_note)
  WHERE id = _request_id AND status = 'pending';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'request not found or already processed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_community_listing_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_community_listing_request(uuid, text) TO authenticated;
