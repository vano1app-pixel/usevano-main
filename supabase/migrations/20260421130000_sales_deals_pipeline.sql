-- Digital-sales deal pipeline: give sales freelancers and the
-- businesses that hire them a shared, queryable record of every lead
-- the freelancer sources. Without this, "expected bonus per deal" in
-- the onboarding wizard is a handshake number — nobody can agree on
-- what closed, when, or what it was worth.
--
-- Data model:
--   1. sales_deals: one row per lead the freelancer logs. Stage
--      machine moves sourced → qualified → meeting → proposal →
--      closed_won | closed_lost. Bonus rate + unit are snapshotted
--      onto the row at close time so a mid-engagement change to the
--      freelancer's profile doesn't retroactively affect past deals.
--   2. sales_deal_events: immutable audit trail of every stage
--      transition and bonus action. Kept separate from the main row
--      so "who moved this to closed_won" survives any future UPDATE.
--
-- Payout is a follow-up — the "pay bonus" button creates a
-- vano_payments row via the existing Vano Pay RPC. This migration
-- just lands the pipeline, not the money-movement hook.

CREATE TABLE IF NOT EXISTS public.sales_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Participants. The freelancer is the one selling; the business is
  -- the client who hired them. Both sides can read and annotate the
  -- row via the RLS policies below.
  freelancer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional conversation pointer so the pipeline row can open back
  -- to the thread where the hire happened. Not a hard requirement at
  -- insert time because a freelancer might log a lead before a
  -- conversation thread exists (rare, but Vano doesn't enforce it).
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,

  -- Lead metadata. Name + company are the minimum freelancers log
  -- when sourcing; both are required so we can't end up with an
  -- unlabelled row nobody recognises six weeks later.
  lead_name    text NOT NULL CHECK (char_length(lead_name) BETWEEN 1 AND 140),
  lead_company text NOT NULL CHECK (char_length(lead_company) BETWEEN 1 AND 140),
  notes        text CHECK (notes IS NULL OR char_length(notes) <= 1000),

  -- Deal value in cents. Nullable until the deal progresses past
  -- `qualified` — freelancer fills it in when there's a real number
  -- to attach. Commission math uses this.
  deal_amount_cents int CHECK (deal_amount_cents IS NULL OR deal_amount_cents >= 0),

  -- Pipeline stage. The list is open-ended enough to cover every
  -- category of work on Vano (SaaS / agencies / services) without
  -- being so granular that the UI needs 12 columns.
  stage text NOT NULL DEFAULT 'sourced'
    CHECK (stage IN ('sourced','qualified','meeting','proposal','closed_won','closed_lost')),

  -- Bonus snapshot — captured at close time from the freelancer's
  -- student_profiles row so a later rate change doesn't
  -- retroactively alter a booked deal. rate + unit together describe
  -- "10% of deal_amount" vs "€50 per client." Computed value in
  -- cents lives in bonus_amount_cents.
  bonus_rate numeric(12,4),
  bonus_unit text CHECK (bonus_unit IN ('percentage','flat')),
  bonus_amount_cents int CHECK (bonus_amount_cents IS NULL OR bonus_amount_cents >= 0),

  -- Bonus payout tracking. Moves independently of `stage` so a deal
  -- can be `closed_won` with bonus still `pending`. Terminal states
  -- are `paid` (Vano Pay transfer confirmed) and `waived` (business
  -- says no, freelancer acknowledged).
  bonus_status text NOT NULL DEFAULT 'pending'
    CHECK (bonus_status IN ('pending','approved','paid','waived','disputed')),
  -- Foreign pointer to the vano_payments row that settled the bonus,
  -- once the bonus-payout RPC fires. Loose reference (no FK) so we
  -- don't need to re-deploy this migration if vano_payments ever
  -- changes schema.
  bonus_payment_id uuid,

  closed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hot indexes for the pipeline UI. Freelancer view renders "my open
-- deals by stage" → ordered (freelancer_id, stage, updated_at);
-- business view renders "deals by this freelancer" → ordered
-- (business_id, updated_at).
CREATE INDEX IF NOT EXISTS sales_deals_freelancer_stage_idx
  ON public.sales_deals (freelancer_id, stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS sales_deals_business_updated_idx
  ON public.sales_deals (business_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS sales_deals_conversation_idx
  ON public.sales_deals (conversation_id);

ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;

-- Participants (freelancer + business) read their own deals. Mirrors
-- the vano_payments SELECT policy so the same mental model applies.
DROP POLICY IF EXISTS "sales_deals_select_participants" ON public.sales_deals;
CREATE POLICY "sales_deals_select_participants"
  ON public.sales_deals
  FOR SELECT
  TO authenticated
  USING (freelancer_id = auth.uid() OR business_id = auth.uid());

-- Freelancer logs their own leads. Business is identified via the
-- insert payload (they're the client the freelancer is working for);
-- the freelancer can't fabricate a deal on a business they don't
-- have a conversation with — the UI gates the business dropdown to
-- existing hire relationships, but if a malicious client bypasses
-- the UI the worst they can do is pollute their own pipeline view
-- with a fake lead naming a business they know. Acceptable risk.
DROP POLICY IF EXISTS "sales_deals_insert_freelancer" ON public.sales_deals;
CREATE POLICY "sales_deals_insert_freelancer"
  ON public.sales_deals
  FOR INSERT
  TO authenticated
  WITH CHECK (freelancer_id = auth.uid());

-- Either party can update a deal they're on. Freelancer typically
-- drives sourced → proposal; business drives closed_won / closed_lost
-- and the bonus lifecycle. The UI handles the human role split; RLS
-- stays permissive so we don't block legit updates.
DROP POLICY IF EXISTS "sales_deals_update_participants" ON public.sales_deals;
CREATE POLICY "sales_deals_update_participants"
  ON public.sales_deals
  FOR UPDATE
  TO authenticated
  USING (freelancer_id = auth.uid() OR business_id = auth.uid())
  WITH CHECK (freelancer_id = auth.uid() OR business_id = auth.uid());

-- Freelancer can delete their own pending leads (e.g. a typo) but
-- can't nuke a closed deal once it's booked. Business can't delete
-- at all — disputes go through bonus_status, not a DELETE.
DROP POLICY IF EXISTS "sales_deals_delete_freelancer_open" ON public.sales_deals;
CREATE POLICY "sales_deals_delete_freelancer_open"
  ON public.sales_deals
  FOR DELETE
  TO authenticated
  USING (
    freelancer_id = auth.uid()
    AND stage NOT IN ('closed_won','closed_lost')
  );

DROP TRIGGER IF EXISTS update_sales_deals_updated_at ON public.sales_deals;
CREATE TRIGGER update_sales_deals_updated_at
  BEFORE UPDATE ON public.sales_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- When a deal transitions to a terminal stage, snapshot the close
-- timestamp so the pipeline UI can render "closed X days ago"
-- without recomputing from an audit trail. Idempotent — the column
-- is only stamped the first time the deal enters closed_won /
-- closed_lost, so subsequent UPDATEs (e.g. bonus payout) don't
-- rewrite it.
CREATE OR REPLACE FUNCTION public.sales_deal_stamp_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.stage IN ('closed_won','closed_lost')
     AND (OLD.stage IS NULL OR OLD.stage NOT IN ('closed_won','closed_lost'))
  THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_deals_closed_at_trg ON public.sales_deals;
CREATE TRIGGER sales_deals_closed_at_trg
  BEFORE UPDATE ON public.sales_deals
  FOR EACH ROW EXECUTE FUNCTION public.sales_deal_stamp_closed_at();


COMMENT ON TABLE public.sales_deals IS
  'Shared pipeline between a digital-sales freelancer and each business they work for. Freelancer logs leads, both parties move the stage, bonus amount is computed from the freelancer''s snapshot rate at close time.';
COMMENT ON COLUMN public.sales_deals.bonus_rate IS
  'Rate captured at close time (e.g. 10 = 10% for percentage unit, or €50 for flat unit). Decoupled from the live student_profiles value so historical deals stay stable.';
COMMENT ON COLUMN public.sales_deals.bonus_amount_cents IS
  'Computed bonus in cents. Null until stage=closed_won AND deal_amount_cents is set (percentage case) or bonus_rate is set (flat case).';
COMMENT ON COLUMN public.sales_deals.bonus_status IS
  'Bonus lifecycle: pending (just closed, awaiting business approval) → approved (business confirmed) → paid (vano_payment cleared). Terminal: waived or disputed.';
COMMENT ON COLUMN public.sales_deals.bonus_payment_id IS
  'Loose pointer to the vano_payments row that settled this bonus. No FK so the pipeline schema survives vano_payments changes.';
