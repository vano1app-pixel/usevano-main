-- AI Find growth loop (pieces 2 + 3): ai_find_requests ties a hire
-- brief to a Stripe €5 checkout and to the AI-generated matches.
--
-- Flow:
--   1. /hire POSTs to create-ai-find-checkout → inserts row
--      (status='awaiting_payment'), stores stripe_session_id, returns
--      the Stripe Checkout URL.
--   2. Stripe → stripe-webhook verifies signature and flips the row to
--      'paid' (idempotent on retry). Webhook then invokes
--      ai-find-freelancer with the row id.
--   3. ai-find-freelancer flips 'paid' → 'scouting', runs the Vano +
--      web picks, writes the results back (vano_match_user_id and/or
--      web_scout_id), flips to 'complete' (or 'failed').
--   4. /ai-find/:id polls this row; when 'complete', it renders the
--      two-card results UI.
--
-- Writes are service-role only (edge functions). Clients read their own
-- row via RLS; results page hydrates scouted_freelancers preview via a
-- dedicated RPC (piece 3 will add it if needed — MVP joins through the
-- requester-owned row plus scouted_freelancers_select_requester policy
-- added in piece 1).

CREATE TABLE IF NOT EXISTS public.ai_find_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Frozen brief. Never mutate after insert — used verbatim in
  -- outreach and on the results page.
  brief text NOT NULL,
  category text,
  budget_range text,
  timeline text,
  location text,

  -- Stripe
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_payment_status text,
  amount_eur numeric NOT NULL DEFAULT 5,

  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','scouting','complete','failed','refunded')),

  -- Results
  vano_match_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  web_scout_id uuid REFERENCES public.scouted_freelancers(id) ON DELETE SET NULL,
  error_message text,

  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_find_requests_requester_created_idx
  ON public.ai_find_requests (requester_id, created_at DESC);

-- Partial index for the webhook handler's idempotent "flip awaiting_payment
-- → paid" update. Keeps the hot path fast as the table grows.
CREATE INDEX IF NOT EXISTS ai_find_requests_awaiting_idx
  ON public.ai_find_requests (stripe_session_id)
  WHERE status = 'awaiting_payment';

ALTER TABLE public.ai_find_requests ENABLE ROW LEVEL SECURITY;

-- Requester sees their own briefs + results.
DROP POLICY IF EXISTS "ai_find_requests_select_requester" ON public.ai_find_requests;
CREATE POLICY "ai_find_requests_select_requester"
  ON public.ai_find_requests
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

-- No INSERT/UPDATE/DELETE for clients — all writes go through the
-- service-role edge functions (create-ai-find-checkout, stripe-webhook,
-- ai-find-freelancer).

DROP TRIGGER IF EXISTS update_ai_find_requests_updated_at ON public.ai_find_requests;
CREATE TRIGGER update_ai_find_requests_updated_at
  BEFORE UPDATE ON public.ai_find_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Piece 3 needs to de-duplicate scouts by portfolio URL so a client who
-- asks for the same kind of freelancer twice in a row doesn't get the
-- same web pick (and doesn't spam the real person with two outreach
-- emails). A partial unique index tolerates NULLs (some scouts might
-- have only a source_url, no dedicated portfolio_url) while still
-- preventing duplicates for the common case.
CREATE UNIQUE INDEX IF NOT EXISTS scouted_freelancers_portfolio_url_unq
  ON public.scouted_freelancers (portfolio_url)
  WHERE portfolio_url IS NOT NULL;


COMMENT ON TABLE public.ai_find_requests IS
  'One row per €5 AI Find purchase. State machine: awaiting_payment → paid (webhook) → scouting (edge fn) → complete | failed.';
COMMENT ON COLUMN public.ai_find_requests.stripe_session_id IS
  'Stripe Checkout Session id. Set at row creation, used by the webhook to find-and-flip. UNIQUE so a replayed webhook doesn''t create phantom rows.';
COMMENT ON COLUMN public.ai_find_requests.vano_match_user_id IS
  'Best match from the Vano freelancer pool. NULL if AI found nothing internal — results page then only shows the web pick.';
COMMENT ON COLUMN public.ai_find_requests.web_scout_id IS
  'The scouted_freelancers row surfaced by the AI for this brief. NULL if web scouting turned up nothing — fallback to Vano pick only.';
