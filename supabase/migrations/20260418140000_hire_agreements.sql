-- Ship the hire_agreements table (previously lived only in the local
-- 20260415160000 migration, never applied to the remote DB). The
-- frontend has always called createHireAgreement / getActiveHireAgreement
-- via src/lib/hireAgreement.ts from src/pages/Messages.tsx; without this
-- migration every chat silently no-ops the "Mark as hired" button.
--
-- Also retroactively adds the FK on vano_payments.hire_agreement_id that
-- we had to skip when adding that column (hire_agreements didn't exist
-- yet). Applied live via MCP.

CREATE TABLE IF NOT EXISTS public.hire_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  brief text,
  hourly_rate numeric,
  total_budget numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (business_id, freelancer_id, conversation_id, status)
);

CREATE INDEX IF NOT EXISTS hire_agreements_business_idx ON public.hire_agreements (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hire_agreements_freelancer_idx ON public.hire_agreements (freelancer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hire_agreements_conversation_idx ON public.hire_agreements (conversation_id);

ALTER TABLE public.hire_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hire_agreements_select_party" ON public.hire_agreements;
CREATE POLICY "hire_agreements_select_party" ON public.hire_agreements
  FOR SELECT TO authenticated
  USING (business_id = auth.uid() OR freelancer_id = auth.uid());

DROP POLICY IF EXISTS "hire_agreements_insert_business" ON public.hire_agreements;
CREATE POLICY "hire_agreements_insert_business" ON public.hire_agreements
  FOR INSERT TO authenticated
  WITH CHECK (business_id = auth.uid());

DROP POLICY IF EXISTS "hire_agreements_update_business" ON public.hire_agreements;
CREATE POLICY "hire_agreements_update_business" ON public.hire_agreements
  FOR UPDATE TO authenticated
  USING (business_id = auth.uid())
  WITH CHECK (business_id = auth.uid());

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
  SELECT display_name INTO v_business_name FROM public.profiles WHERE user_id = NEW.business_id;
  SELECT display_name INTO v_freelancer_name FROM public.profiles WHERE user_id = NEW.freelancer_id;

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
  'Formal hired handshake. One row per business-freelancer agreement. Trigger posts a system message in the linked conversation.';

-- Patch the vano_payments FK that was skipped at table creation time.
ALTER TABLE public.vano_payments
  DROP CONSTRAINT IF EXISTS vano_payments_hire_agreement_id_fkey;
ALTER TABLE public.vano_payments
  ADD CONSTRAINT vano_payments_hire_agreement_id_fkey
  FOREIGN KEY (hire_agreement_id) REFERENCES public.hire_agreements(id) ON DELETE SET NULL;
