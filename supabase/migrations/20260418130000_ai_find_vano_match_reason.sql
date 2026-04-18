-- Surface the Vano pick reason on the AI Find results page.
--
-- Gemini already returns a `reason` string when scoring the best
-- internal candidate in pickVanoMatch (ai-find-freelancer edge fn),
-- but we were discarding it. This column lets the function stamp it
-- on the row so AiFindResults can render "Why Vano picked them: …".

ALTER TABLE public.ai_find_requests
  ADD COLUMN IF NOT EXISTS vano_match_reason text;

COMMENT ON COLUMN public.ai_find_requests.vano_match_reason IS
  'One-sentence reason Gemini gave for choosing this Vano pick. Surfaced on the results page so the client sees why this freelancer was chosen.';
