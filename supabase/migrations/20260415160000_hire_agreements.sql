-- Formal "✓ Hired {Name}" handshake state. Until now, business and freelancer
-- would agree in chat and the conversation would just… keep being a chat —
-- no shared artifact, no trigger for a review prompt, no hire-count metric.
-- This table is that artifact. The "Mark as hired" button in the conversation
-- header (business-side) inserts one row; a trigger drops a system message
-- into the thread so both parties see "✓ Hire confirmed on {date}".

CREATE TABLE IF NOT EXISTS public.hire_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- Snapshot of whatever was agreed. Optional — the chat transcript is still
  -- the source of truth, this is just nicer for search / dashboards.
  brief text,
  hourly_rate numeric,
  total_budget numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- One active agreement per (business, freelancer, conversation) so the
  -- button can't double-fire. Cancelled/completed rows can coexist with a
  -- new active one (they re-hire the same freelancer for a new job).
  UNIQUE (business_id, freelancer_id, conversation_id, status)
);

CREATE INDEX IF NOT EXISTS hire_agreements_business_idx
  ON public.hire_agreements (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hire_agreements_freelancer_idx
  ON public.hire_agreements (freelancer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hire_agreements_conversation_idx
  ON public.hire_agreements (conversation_id);

ALTER TABLE public.hire_agreements ENABLE ROW LEVEL SECURITY;

-- Both parties of an agreement can read it.
DROP POLICY IF EXISTS "hire_agreements_select_party" ON public.hire_agreements;
CREATE POLICY "hire_agreements_select_party"
  ON public.hire_agreements
  FOR SELECT
  TO authenticated
  USING (business_id = auth.uid() OR freelancer_id = auth.uid());

-- Only the business can create or modify the agreement. The freelancer
-- implicitly accepts by continuing to chat — if they don't want it, they
-- message the business and the business cancels it.
DROP POLICY IF EXISTS "hire_agreements_insert_business" ON public.hire_agreements;
CREATE POLICY "hire_agreements_insert_business"
  ON public.hire_agreements
  FOR INSERT
  TO authenticated
  WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "hire_agreements_update_business" ON public.hire_agreements;
CREATE POLICY "hire_agreements_update_business"
  ON public.hire_agreements
  FOR UPDATE
  TO authenticated
  USING (business_id = auth.uid())
  WITH CHECK (business_id = auth.uid());

-- Trigger: on INSERT, drop a system message into the conversation so both
-- sides see "✓ Hire confirmed" without refreshing. sender_id = the business
-- (the person who hit the button) — RLS on messages requires the sender to
-- be a conversation participant, which the business always is.
CREATE OR REPLACE FUNCTION public.post_hire_agreement_system_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_name text;
  v_freelancer_name text;
BEGIN
  SELECT display_name INTO v_business_name
    FROM public.profiles WHERE user_id = NEW.business_id;
  SELECT display_name INTO v_freelancer_name
    FROM public.profiles WHERE user_id = NEW.freelancer_id;

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (
    NEW.conversation_id,
    NEW.business_id,
    format(
      '✓ Hire confirmed — %s hired %s. Leave a review when the work wraps up.',
      COALESCE(v_business_name, 'The business'),
      COALESCE(v_freelancer_name, 'the freelancer')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hire_agreement_system_message ON public.hire_agreements;
CREATE TRIGGER trg_hire_agreement_system_message
  AFTER INSERT ON public.hire_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.post_hire_agreement_system_message();

COMMENT ON TABLE public.hire_agreements IS
  'Formal "hired" handshake. One row per business↔freelancer agreement. Trigger posts a system message in the linked conversation.';
