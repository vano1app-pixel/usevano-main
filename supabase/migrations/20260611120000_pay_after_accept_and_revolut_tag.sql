-- Pay-after-accept: bookings are now dispatched immediately and the customer
-- pays only once a helper has accepted. These columns track that lifecycle.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_url text;

-- Where to send the student's Revolut payout (collected at signup).
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS revolut_tag text;
