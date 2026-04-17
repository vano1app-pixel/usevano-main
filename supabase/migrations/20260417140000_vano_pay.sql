-- Vano Pay: Stripe Connect pass-through payments from client → freelancer
-- with a 3% platform fee. No escrow at MVP — money flows on approval,
-- freelancer gets their cut via destination charges.
--
-- Data model:
--   1. student_profiles gets two new columns for Stripe Connect state:
--      - stripe_account_id: the Connect Express account id (acct_...)
--      - stripe_payouts_enabled: true once Stripe has verified the
--        account and it can receive transfers.
--   2. vano_payments: one row per Stripe Checkout Session we create to
--      move money from a client to a freelancer. State machine is
--      awaiting_payment → paid → transferred (released to freelancer)
--      | failed | refunded. Lives inside a conversation so the pay
--      button appears in context.

-- Connect state on the freelancer profile. Nullable because 99% of
-- existing freelancers don't have a Connect account yet; they opt in
-- when they want to receive Vano Pay.
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean NOT NULL DEFAULT false;

-- One row per Vano Pay transaction.
CREATE TABLE IF NOT EXISTS public.vano_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Participants: business pays, freelancer receives.
  business_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Context. A conversation must exist (the pay button lives in the
  -- chat UI) and optionally a hire_agreement row ties the payment back
  -- to the specific engagement.
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- No FK: hire_agreements is created by a later migration that may
  -- not have been applied yet in every environment. The column is
  -- kept as a loose reference so older rows survive the eventual FK
  -- being added.
  hire_agreement_id uuid,

  -- Money. amount_cents = what the client pays. fee_cents = Vano's 3%
  -- cut (application_fee_amount on Stripe's side). The freelancer
  -- receives the rest, minus Stripe's own processing fee which comes
  -- out of the destination payout.
  description text,
  amount_cents int NOT NULL CHECK (amount_cents >= 100),
  fee_cents int NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  currency text NOT NULL DEFAULT 'eur',

  -- Stripe refs
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  stripe_destination_account_id text,

  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','paid','transferred','failed','refunded')),
  error_message text,

  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vano_payments_business_created_idx
  ON public.vano_payments (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vano_payments_freelancer_created_idx
  ON public.vano_payments (freelancer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vano_payments_conversation_idx
  ON public.vano_payments (conversation_id, created_at DESC);

-- Partial index for the webhook's idempotent "awaiting → paid" flip.
CREATE INDEX IF NOT EXISTS vano_payments_awaiting_session_idx
  ON public.vano_payments (stripe_session_id)
  WHERE status = 'awaiting_payment';

ALTER TABLE public.vano_payments ENABLE ROW LEVEL SECURITY;

-- Both participants (business + freelancer) can read their own
-- payments — matches the messaging-RLS pattern elsewhere in the
-- schema so the pay card in the conversation UI renders for both
-- sides.
DROP POLICY IF EXISTS "vano_payments_select_participants" ON public.vano_payments;
CREATE POLICY "vano_payments_select_participants"
  ON public.vano_payments
  FOR SELECT
  TO authenticated
  USING (business_id = auth.uid() OR freelancer_id = auth.uid());

-- No INSERT / UPDATE / DELETE policies — the service role (edge
-- functions) owns all writes. Clients trigger them via
-- create-vano-payment-checkout; nothing else can insert.

DROP TRIGGER IF EXISTS update_vano_payments_updated_at ON public.vano_payments;
CREATE TRIGGER update_vano_payments_updated_at
  BEFORE UPDATE ON public.vano_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


COMMENT ON TABLE public.vano_payments IS
  'Client-to-freelancer payments routed through Stripe Connect with a 3% Vano platform fee. State machine: awaiting_payment → paid → transferred | failed | refunded.';
COMMENT ON COLUMN public.vano_payments.fee_cents IS
  'Vano''s cut in cents (Stripe application_fee_amount). Typically round(amount_cents * 0.03). Captured at insert time so the historical fee is stable even if the rate changes later.';
COMMENT ON COLUMN public.vano_payments.stripe_destination_account_id IS
  'The freelancer''s stripe_account_id at the moment of payment. Snapshotted onto the row so audit/debugging survives a freelancer changing or removing their Connect account.';
COMMENT ON COLUMN public.student_profiles.stripe_account_id IS
  'Stripe Connect Express account id (acct_...). Set when the freelancer starts Vano Pay onboarding. Nullable — freelancers opt in.';
COMMENT ON COLUMN public.student_profiles.stripe_payouts_enabled IS
  'True once Stripe account.updated webhook confirms charges_enabled + payouts_enabled. Gates the "Pay via Vano" button.';
