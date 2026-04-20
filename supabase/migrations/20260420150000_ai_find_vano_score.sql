-- Persist Vano match score alongside Vano match reason.
--
-- The edge function's Gemini ranker already returns a 0-100 score
-- for the Vano pick (and the < 40 threshold filters bad matches
-- before the row is written). Previously we discarded the number and
-- kept only the free-text `vano_match_reason`. Surfacing the score on
-- the VanoPickCard lets hirers eyeball "strong match" vs "okay fit"
-- at a glance without having to read the reason — same value the
-- `scouted_freelancers.match_score` column gives the web pick today.
--
-- Nullable because older rows that already shipped pre-deploy have
-- no score to backfill, and missing == "don't render the chip".

ALTER TABLE public.ai_find_requests
  ADD COLUMN IF NOT EXISTS vano_match_score int
    CHECK (vano_match_score IS NULL OR (vano_match_score >= 0 AND vano_match_score <= 100));

COMMENT ON COLUMN public.ai_find_requests.vano_match_score IS
  'Gemini-assigned 0-100 fit score for the Vano pool pick. Null for pre-migration rows. Edge function writes this alongside vano_match_user_id + vano_match_reason.';
