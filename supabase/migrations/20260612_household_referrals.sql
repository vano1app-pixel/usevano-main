-- Referral programme: give €5, get €5.
--
-- Customers are guests identified by phone number, so referral identity is
-- keyed on E.164-normalized phones (normalization happens in the edge
-- functions; the DB just stores what they give it).
--
-- Lifecycle of a household_referrals row:
--   pending  → created when a new customer opens checkout with ?ref applied
--   earned   → referee's booking actually paid (stripe-webhook flips it);
--              from here the referrer's €5 is spendable
--   redeemed → referrer used the €5 on a booking that then got paid
--   void     → reserved for manual ops cleanup

CREATE TABLE IF NOT EXISTS public.household_referral_codes (
  phone       text PRIMARY KEY,       -- E.164 normalized (+3538…)
  code        text UNIQUE NOT NULL,   -- short shareable slug, e.g. 7K3MQZ
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_referrals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL REFERENCES public.household_referral_codes(code),
  referrer_phone      text NOT NULL,
  -- One welcome discount per new customer, ever.
  referee_phone       text NOT NULL UNIQUE,
  referee_booking_id  uuid REFERENCES public.household_bookings(id) ON DELETE SET NULL,
  credit_cents        int  NOT NULL DEFAULT 500,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','earned','redeemed','void')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  earned_at           timestamptz,
  redeemed_at         timestamptz,
  redeemed_booking_id uuid REFERENCES public.household_bookings(id) ON DELETE SET NULL,
  CONSTRAINT no_self_referral CHECK (referrer_phone <> referee_phone)
);

-- "How much credit does this referrer have?" is the hot query at checkout.
CREATE INDEX IF NOT EXISTS idx_household_referrals_referrer
  ON public.household_referrals (referrer_phone, status);

-- Phones are PII: no anon/authenticated policies on purpose. Every read and
-- write goes through service-role edge functions (get-referral-code,
-- create-household-payment-checkout, stripe-webhook).
ALTER TABLE public.household_referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_referrals      ENABLE ROW LEVEL SECURITY;
