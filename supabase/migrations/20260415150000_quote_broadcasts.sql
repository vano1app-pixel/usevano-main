-- Multi-send "Get quotes from top 3" — fan a single brief out to N matched
-- freelancers in parallel so the conversation funnel doesn't dead-end on a
-- single freelancer ghosting. The hirer gets one broadcast; each targeted
-- freelancer gets a real 1:1 conversation with the brief as the first message.
--
-- When the first freelancer replies, the broadcast is auto-marked `filled`
-- by a trigger — we don't auto-decline the others (the hirer can still chat
-- with anyone), but the UI uses `filled_by` / `filled_at` to surface
-- "✓ {name} replied first" badges.

CREATE TABLE IF NOT EXISTS public.quote_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief text NOT NULL,
  category text,
  budget_range text,
  timeline text,
  target_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
  filled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  filled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quote_broadcasts_requester_created_idx
  ON public.quote_broadcasts (requester_id, created_at DESC);

ALTER TABLE public.quote_broadcasts ENABLE ROW LEVEL SECURITY;

-- Requester sees own broadcasts.
DROP POLICY IF EXISTS "quote_broadcasts_select_self" ON public.quote_broadcasts;
CREATE POLICY "quote_broadcasts_select_self"
  ON public.quote_broadcasts
  FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

-- Targeted freelancers also need to read the broadcast to render the
-- "1 of N — be the first to reply" badge on their conversation. They can
-- read any broadcast that has at least one conversation linking to them.
DROP POLICY IF EXISTS "quote_broadcasts_select_target" ON public.quote_broadcasts;
CREATE POLICY "quote_broadcasts_select_target"
  ON public.quote_broadcasts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.broadcast_id = quote_broadcasts.id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Requester can create their own broadcast.
DROP POLICY IF EXISTS "quote_broadcasts_insert_self" ON public.quote_broadcasts;
CREATE POLICY "quote_broadcasts_insert_self"
  ON public.quote_broadcasts
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

-- Requester can cancel their own broadcast (status -> 'cancelled'). The
-- trigger handles the open -> filled transition with elevated privileges.
DROP POLICY IF EXISTS "quote_broadcasts_update_self" ON public.quote_broadcasts;
CREATE POLICY "quote_broadcasts_update_self"
  ON public.quote_broadcasts
  FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid())
  WITH CHECK (requester_id = auth.uid());

-- Conversation linkage: each fan-out conversation references the broadcast.
-- Existing 1:1 conversations are unaffected (broadcast_id stays NULL).
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.quote_broadcasts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_broadcast_id_idx
  ON public.conversations (broadcast_id) WHERE broadcast_id IS NOT NULL;

-- Trigger: the moment any freelancer (= any non-requester) sends a message in
-- a broadcast conversation, mark the broadcast as filled. Idempotent — only
-- updates broadcasts still in `open` status, so the second/third reply
-- doesn't overwrite who-replied-first.
CREATE OR REPLACE FUNCTION public.mark_broadcast_filled_on_first_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_broadcast_id uuid;
  v_requester_id uuid;
BEGIN
  SELECT c.broadcast_id, qb.requester_id
    INTO v_broadcast_id, v_requester_id
    FROM public.conversations c
    LEFT JOIN public.quote_broadcasts qb ON qb.id = c.broadcast_id
    WHERE c.id = NEW.conversation_id;

  -- Not a broadcast conversation, or the broadcast was deleted.
  IF v_broadcast_id IS NULL OR v_requester_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- The requester's own messages don't count — they're the brief itself
  -- and any subsequent follow-up from the hirer.
  IF NEW.sender_id = v_requester_id THEN
    RETURN NEW;
  END IF;

  -- First freelancer reply wins. Subsequent replies into the same broadcast
  -- conversation (or sibling conversations) are no-ops.
  UPDATE public.quote_broadcasts
     SET status     = 'filled',
         filled_by  = NEW.sender_id,
         filled_at  = now()
   WHERE id = v_broadcast_id
     AND status = 'open';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_broadcast_filled ON public.messages;
CREATE TRIGGER trg_mark_broadcast_filled
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_broadcast_filled_on_first_reply();

COMMENT ON TABLE  public.quote_broadcasts IS
  'A single brief fanned out to N freelancers in parallel. Conversations.broadcast_id links the per-target conversations back here.';
COMMENT ON COLUMN public.quote_broadcasts.target_count IS
  'How many freelancers the brief was sent to. Cached for UI ("1 of N") so we don''t have to count conversations every render.';
COMMENT ON COLUMN public.quote_broadcasts.filled_by IS
  'The freelancer (auth.users.id) whose reply marked this broadcast filled. Set by trg_mark_broadcast_filled.';
