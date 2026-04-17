-- AI Find growth loop (piece 1): scouted_freelancers table + claim RPCs.
--
-- When the €5 "AI Find" flow turns up a freelancer from the open web
-- (Behance/Dribbble/LinkedIn/GitHub/personal sites/etc.) we store them
-- here with a one-time claim_token. The freelancer gets a link back to
-- /claim/:token; once they verify email + phone the row is linked to a
-- real auth.users account and their student_profile is prefilled from
-- the scout data so they land in the Vano pool on their next search.
--
-- Writes are service-role only (AI find edge function). Clients read via
-- the public RPCs below — direct SELECT is restricted to the requester
-- (who triggered the scout) and the claimer (once claimed).

CREATE TABLE IF NOT EXISTS public.scouted_freelancers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who asked; nullable so we can cache scouts across briefs.
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  brief_snapshot text,

  -- Identity / preview
  name text NOT NULL,
  avatar_url text,
  bio text,
  skills text[] NOT NULL DEFAULT '{}',
  location text,

  -- Source of the scout
  source_platform text NOT NULL,
  source_url text NOT NULL,
  portfolio_url text,

  -- Best-effort contact channels. The edge function must find at least
  -- one before inserting, but we don't enforce it at the DB layer —
  -- contact discovery is noisy and we'd rather keep a lead with only a
  -- portfolio URL than drop it.
  contact_email text,
  contact_phone text,
  contact_instagram text,
  contact_linkedin text,

  match_score numeric,

  -- Claim flow
  claim_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  claim_token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  claimed_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,

  -- Outreach tracking (piece 2 will populate this).
  outreach_channel text CHECK (outreach_channel IN ('email','sms','instagram','linkedin','none')),
  outreach_sent_at timestamptz,

  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','outreach_sent','claimed','expired','dismissed')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scouted_freelancers_requester_created_idx
  ON public.scouted_freelancers (requester_id, created_at DESC);

CREATE INDEX IF NOT EXISTS scouted_freelancers_claim_token_idx
  ON public.scouted_freelancers (claim_token);

-- Partial index for the "outreach worker" to scan pending scouts cheaply.
CREATE INDEX IF NOT EXISTS scouted_freelancers_pending_outreach_idx
  ON public.scouted_freelancers (created_at)
  WHERE status IN ('new','outreach_sent') AND claimed_user_id IS NULL;

ALTER TABLE public.scouted_freelancers ENABLE ROW LEVEL SECURITY;

-- Requester sees their own scouts (for a future "my searches" screen).
DROP POLICY IF EXISTS "scouted_freelancers_select_requester" ON public.scouted_freelancers;
CREATE POLICY "scouted_freelancers_select_requester"
  ON public.scouted_freelancers
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

-- Claimer sees their claimed scout (post-claim confirmation).
DROP POLICY IF EXISTS "scouted_freelancers_select_claimer" ON public.scouted_freelancers;
CREATE POLICY "scouted_freelancers_select_claimer"
  ON public.scouted_freelancers
  FOR SELECT
  TO authenticated
  USING (claimed_user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies — writes go through the service role
-- (edge functions) or the SECURITY DEFINER claim RPC below.

DROP TRIGGER IF EXISTS update_scouted_freelancers_updated_at ON public.scouted_freelancers;
CREATE TRIGGER update_scouted_freelancers_updated_at
  BEFORE UPDATE ON public.scouted_freelancers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Public lookup by token. The /claim/:token page calls this BEFORE the
-- visitor is signed in so we can render the preview card ("Someone wanted
-- to hire you for X — claim your profile to respond"). Returns only
-- preview-safe fields — never the raw contact info or the token itself.
CREATE OR REPLACE FUNCTION public.get_scouted_freelancer_by_token(p_token uuid)
RETURNS TABLE (
  name text,
  avatar_url text,
  bio text,
  skills text[],
  location text,
  portfolio_url text,
  source_platform text,
  brief_snapshot text,
  claimed boolean,
  expired boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    sf.name,
    sf.avatar_url,
    sf.bio,
    sf.skills,
    sf.location,
    sf.portfolio_url,
    sf.source_platform,
    sf.brief_snapshot,
    (sf.claimed_user_id IS NOT NULL)        AS claimed,
    (sf.claim_token_expires_at < now())     AS expired
  FROM public.scouted_freelancers sf
  WHERE sf.claim_token = p_token
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_scouted_freelancer_by_token(uuid)
  TO anon, authenticated;


-- Claim RPC. Requires an authenticated caller. Links the scout to the
-- calling user, flips profile.user_type to 'student' if it's not set
-- yet, and prefills student_profiles with the scouted bio/skills/phone
-- — but never overwrites values the user has already typed themselves.
-- Returns a JSON status object so the client can branch on the error
-- cases without parsing SQLSTATE codes.
CREATE OR REPLACE FUNCTION public.claim_scouted_freelancer(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scout         public.scouted_freelancers%ROWTYPE;
  v_user_id       uuid := auth.uid();
  v_user_type     text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO v_scout
    FROM public.scouted_freelancers
    WHERE claim_token = p_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_scout.claim_token_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF v_scout.claimed_user_id IS NOT NULL THEN
    IF v_scout.claimed_user_id = v_user_id THEN
      -- Re-claim by same user is a no-op success (idempotent if the
      -- client retries the RPC after an already-successful claim).
      RETURN jsonb_build_object('ok', true, 'already_claimed', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'already_claimed');
  END IF;

  -- A business account can't moonlight as a scouted freelancer here;
  -- they need a fresh account. Surface a clear error so the UI can
  -- point them at sign-out + re-signup.
  SELECT user_type INTO v_user_type
    FROM public.profiles
    WHERE user_id = v_user_id;

  IF v_user_type = 'business' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'business_account');
  END IF;

  -- Ensure a profiles row exists (handle_new_user normally seeds it,
  -- but we can't assume — upsert defensively) and flip to student.
  INSERT INTO public.profiles (user_id, user_type, display_name, phone)
  VALUES (
    v_user_id,
    'student',
    v_scout.name,
    COALESCE(v_scout.contact_phone, '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    user_type    = COALESCE(NULLIF(public.profiles.user_type, ''), 'student'),
    display_name = COALESCE(NULLIF(public.profiles.display_name, ''), EXCLUDED.display_name),
    phone        = COALESCE(NULLIF(public.profiles.phone, ''), EXCLUDED.phone);

  -- Prefill student_profiles. Preserve any values the user has already
  -- filled in (possible if they started the wizard, bailed, then
  -- clicked the claim link later).
  INSERT INTO public.student_profiles (user_id, bio, skills, phone)
  VALUES (
    v_user_id,
    COALESCE(v_scout.bio, ''),
    COALESCE(v_scout.skills, '{}'),
    COALESCE(v_scout.contact_phone, '')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    bio    = COALESCE(NULLIF(public.student_profiles.bio, ''), EXCLUDED.bio),
    skills = CASE
               WHEN COALESCE(array_length(public.student_profiles.skills, 1), 0) = 0
                 THEN EXCLUDED.skills
               ELSE public.student_profiles.skills
             END,
    phone  = COALESCE(NULLIF(public.student_profiles.phone, ''), EXCLUDED.phone);

  -- Mark the scout claimed. Token stays in the row for audit; the
  -- expiry check above prevents it being reused by a different user.
  UPDATE public.scouted_freelancers
    SET claimed_user_id = v_user_id,
        claimed_at      = now(),
        status          = 'claimed'
    WHERE id = v_scout.id;

  RETURN jsonb_build_object('ok', true, 'claimed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_scouted_freelancer(uuid)
  TO authenticated;


COMMENT ON TABLE public.scouted_freelancers IS
  'Freelancers found on the open web by the AI Find flow. One-time claim_token lets the real person claim a Vano profile, growing the internal pool over time.';
COMMENT ON COLUMN public.scouted_freelancers.brief_snapshot IS
  'The client brief that surfaced this scout, frozen at scout time for context in outreach and on the claim page.';
COMMENT ON COLUMN public.scouted_freelancers.claim_token IS
  'Opaque UUID shared in the outreach link. Single-use; claim_scouted_freelancer enforces expiry and one-claim-per-token.';
