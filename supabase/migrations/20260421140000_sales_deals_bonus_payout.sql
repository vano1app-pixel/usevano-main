-- Close the digital-sales bonus-payout loop: when a business approves
-- a `closed_won` deal and pays the bonus through Vano Pay, the
-- resulting vano_payments row needs to be able to find its way back
-- to the originating sales_deals row so the pipeline UI can flip
-- `bonus_status` from `approved` → `paid` automatically once the
-- Stripe webhook confirms the transfer.
--
-- Design:
--   1. vano_payments.sales_deal_id — nullable, loose reference (no FK)
--      to keep the column forgiving if either schema evolves
--      separately. Stamped by create-vano-payment-checkout when the
--      checkout originates from the "Pay bonus" button in the
--      BusinessDealsPanel; null for every other Vano Pay flow.
--   2. Trigger on vano_payments UPDATE mirrors status transitions
--      onto sales_deals:
--        - status → 'transferred' ⇒ sales_deals.bonus_status = 'paid'
--          + bonus_payment_id stamped.
--        - status → 'refunded'    ⇒ sales_deals.bonus_status = 'disputed'
--          + bonus_payment_id cleared so the business can pay again if
--          the refund was a mistake.
--      Runs SECURITY DEFINER so the webhook service role can update
--      sales_deals without needing a dedicated RLS policy for cross-
--      table writes.

ALTER TABLE public.vano_payments
  ADD COLUMN IF NOT EXISTS sales_deal_id uuid;

CREATE INDEX IF NOT EXISTS vano_payments_sales_deal_idx
  ON public.vano_payments (sales_deal_id)
  WHERE sales_deal_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_sales_deal_bonus_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react when (a) this payment is linked to a deal, and
  -- (b) the status actually moved. Guards against the trigger firing
  -- on unrelated column updates (e.g. description edits).
  IF NEW.sales_deal_id IS NOT NULL
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF NEW.status = 'transferred' THEN
      UPDATE public.sales_deals
         SET bonus_status = 'paid',
             bonus_payment_id = NEW.id
       WHERE id = NEW.sales_deal_id
         AND bonus_status IN ('approved', 'pending');
    ELSIF NEW.status = 'refunded' THEN
      UPDATE public.sales_deals
         SET bonus_status = 'disputed',
             bonus_payment_id = NULL
       WHERE id = NEW.sales_deal_id
         AND bonus_payment_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vano_payments_sync_sales_deal ON public.vano_payments;
CREATE TRIGGER vano_payments_sync_sales_deal
  AFTER UPDATE ON public.vano_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sales_deal_bonus_from_payment();


COMMENT ON COLUMN public.vano_payments.sales_deal_id IS
  'Loose pointer back to the sales_deals row that triggered this payment. Populated only for digital-sales bonus payouts — other Vano Pay flows leave it null.';
