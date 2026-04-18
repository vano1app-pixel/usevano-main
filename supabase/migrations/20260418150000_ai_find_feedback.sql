-- Thumbs up/down on AI Find results + one-tap "show me a different
-- match" retry per side. Costs the client nothing, gives Vano a real
-- quality signal to tune prompts on, and makes every €1 feel less
-- terminal if the first pick isn't right.
--
-- Hard cap: 1 retry per side. A paid brief thus returns up to
-- 2 Vano picks + 2 web picks (first + retry). Prevents an unbounded
-- retry loop burning Gemini/Serper budget.

ALTER TABLE public.ai_find_requests
  ADD COLUMN IF NOT EXISTS vano_match_feedback text
    CHECK (vano_match_feedback IS NULL OR vano_match_feedback IN ('up', 'down')),
  ADD COLUMN IF NOT EXISTS web_match_feedback text
    CHECK (web_match_feedback IS NULL OR web_match_feedback IN ('up', 'down')),
  ADD COLUMN IF NOT EXISTS rejected_vano_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rejected_web_portfolio_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vano_retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS web_retry_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_find_requests.vano_match_feedback IS
  'Client thumbs on the Vano pick. Captured for prompt tuning; down triggers the retry button in the UI.';
COMMENT ON COLUMN public.ai_find_requests.rejected_vano_user_ids IS
  'User IDs the client has thumbs-downed on this brief. Passed to ai-find-retry so we never re-suggest them.';
COMMENT ON COLUMN public.ai_find_requests.vano_retry_count IS
  'How many times the client has retried the Vano pick on this brief. Hard-capped at 1 in ai-find-retry.';


-- RPC: set the thumbs state. SECURITY DEFINER so clients can't write
-- arbitrary rows — we verify the caller owns the ai_find_requests
-- row here before flipping.
CREATE OR REPLACE FUNCTION public.submit_ai_find_feedback(
  p_request_id uuid,
  p_side text,
  p_verdict text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_owner uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF p_side NOT IN ('vano', 'web') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_side');
  END IF;

  IF p_verdict NOT IN ('up', 'down') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_verdict');
  END IF;

  SELECT requester_id INTO v_owner
  FROM public.ai_find_requests
  WHERE id = p_request_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_owner <> v_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;

  IF p_side = 'vano' THEN
    UPDATE public.ai_find_requests
    SET vano_match_feedback = p_verdict
    WHERE id = p_request_id;
  ELSE
    UPDATE public.ai_find_requests
    SET web_match_feedback = p_verdict
    WHERE id = p_request_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_ai_find_feedback(uuid, text, text) TO authenticated;
