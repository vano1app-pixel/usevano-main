-- Replace the 'photography' community category with 'digital_sales' and add
-- infrastructure for tracking clients a sales rep brings to a business.
--
-- 1. Extend student_profiles with an optional starting-track-record counter
--    used on the listing wizard and shown as a badge on public profiles.
-- 2. Create sales_client_referrals — a simple ledger where a sales rep logs
--    each client they've brought to a specific business (deal value +
--    commission). The hiring business can verify or dispute each row.
-- 3. Migrate existing 'photography' data to 'digital_sales' and update the
--    community_posts CHECK constraint accordingly.

-- ── 1. student_profiles: starting client count ──
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS initial_clients_brought INTEGER NOT NULL DEFAULT 0
  CHECK (initial_clients_brought >= 0);

COMMENT ON COLUMN public.student_profiles.initial_clients_brought IS
  'Self-reported starting client count for digital_sales listings; verified deals live in sales_client_referrals.';

-- ── 2. sales_client_referrals ──
CREATE TABLE IF NOT EXISTS public.sales_client_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_value_eur NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (deal_value_eur >= 0),
  commission_eur NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (commission_eur >= 0),
  note TEXT,
  verified_by_business BOOLEAN NOT NULL DEFAULT FALSE,
  disputed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_client_referrals_sales_user_idx
  ON public.sales_client_referrals(sales_user_id);
CREATE INDEX IF NOT EXISTS sales_client_referrals_business_user_idx
  ON public.sales_client_referrals(business_user_id);

-- Keep updated_at fresh on every row mutation.
CREATE OR REPLACE FUNCTION public.tg_sales_client_referrals_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_client_referrals_touch ON public.sales_client_referrals;
CREATE TRIGGER sales_client_referrals_touch
  BEFORE UPDATE ON public.sales_client_referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sales_client_referrals_touch();

ALTER TABLE public.sales_client_referrals ENABLE ROW LEVEL SECURITY;

-- Both parties to a referral can read it.
DROP POLICY IF EXISTS "sales_referrals_select" ON public.sales_client_referrals;
CREATE POLICY "sales_referrals_select"
  ON public.sales_client_referrals
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sales_user_id OR auth.uid() = business_user_id);

-- Only the sales rep creates rows (and only on their own behalf).
DROP POLICY IF EXISTS "sales_referrals_insert" ON public.sales_client_referrals;
CREATE POLICY "sales_referrals_insert"
  ON public.sales_client_referrals
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = sales_user_id);

-- Sales rep can edit / delete their own rows until the business has verified.
DROP POLICY IF EXISTS "sales_referrals_update_sales" ON public.sales_client_referrals;
CREATE POLICY "sales_referrals_update_sales"
  ON public.sales_client_referrals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = sales_user_id AND verified_by_business = FALSE)
  WITH CHECK (auth.uid() = sales_user_id);

DROP POLICY IF EXISTS "sales_referrals_delete_sales" ON public.sales_client_referrals;
CREATE POLICY "sales_referrals_delete_sales"
  ON public.sales_client_referrals
  FOR DELETE
  TO authenticated
  USING (auth.uid() = sales_user_id AND verified_by_business = FALSE);

-- Hiring business can verify / dispute referrals pointed at them.
DROP POLICY IF EXISTS "sales_referrals_update_business" ON public.sales_client_referrals;
CREATE POLICY "sales_referrals_update_business"
  ON public.sales_client_referrals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = business_user_id)
  WITH CHECK (auth.uid() = business_user_id);

-- ── 3. Migrate 'photography' → 'digital_sales' ──
UPDATE public.community_posts
  SET category = 'digital_sales'
  WHERE category = 'photography';

UPDATE public.community_listing_requests
  SET category = 'digital_sales'
  WHERE category = 'photography';

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN ('videography', 'digital_sales', 'websites', 'social_media'));

COMMENT ON COLUMN public.community_posts.category IS
  'Board: videography | digital_sales | websites | social_media';
