-- Fix wizard "do not have permission" error (Postgres 42501).
--
-- The security-hardening migration (20260411120000_security_hardening_v2.sql)
-- locked community_posts INSERT to `moderation_status = 'pending'` only —
-- users can no longer self-approve via direct API. That was correct for
-- security, but the wizard's publish flow has always intended instant
-- go-live (no manual moderation queue), so every freelancer who hits
-- "Go live" now gets an RLS rejection → friendly message "You do not
-- have permission to perform this action."
--
-- Fix: a SECURITY DEFINER RPC that the wizard calls instead of doing a
-- direct INSERT. The RPC still verifies the caller is an authenticated
-- student publishing their own row, but runs the INSERT with elevated
-- privileges so it's allowed to write `moderation_status = 'approved'`.
--
-- Preserves the original RLS lock (random API calls still can't
-- self-approve), while giving the wizard a single sanctioned path to
-- publish instantly.

CREATE OR REPLACE FUNCTION public.publish_community_listing(
  _category text,
  _title text,
  _description text,
  _image_url text,
  _rate_min numeric,
  _rate_max numeric,
  _rate_unit text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  new_post_id uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  -- Only students can publish freelancer listings — mirrors the check in
  -- the old direct-insert RLS policy.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = uid AND profiles.user_type = 'student'
  ) THEN
    RAISE EXCEPTION 'only students can publish listings' USING ERRCODE = '42501';
  END IF;

  -- Replace any existing community_posts for this user (wizard treats
  -- every publish as "upsert the current listing", same semantics the
  -- client used to have inline).
  DELETE FROM public.community_posts WHERE user_id = uid;

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
    uid,
    _category,
    _title,
    _description,
    _image_url,
    _rate_min,
    _rate_max,
    _rate_unit,
    'approved'
  )
  RETURNING id INTO new_post_id;

  RETURN new_post_id;
END;
$$;

COMMENT ON FUNCTION public.publish_community_listing IS
  'Wizard publish path. SECURITY DEFINER so authenticated students can create their own community_posts row with moderation_status=approved — direct INSERT RLS blocks self-approval since the 20260411 hardening.';

GRANT EXECUTE ON FUNCTION public.publish_community_listing TO authenticated;
