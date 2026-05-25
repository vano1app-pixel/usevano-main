-- Extend household_bookings to support the public quick-booking flow
-- that doesn't require a user account:
--   1. Add 'awaiting_payment' to the status enum (the stripe-webhook handler
--      already expects it; the original migration omitted it).
--   2. Make customer_id nullable so anonymous (unauthenticated) customers
--      can book via the CategoryGrid card-payment path.
--   3. Make time_slot nullable for the quick-booking flow which collects
--      a when-label ('Today', 'Tomorrow', …) rather than a time slot.
--   4. Update the INSERT RLS policy to allow anonymous rows.

-- 1. Rebuild the status check to include awaiting_payment
ALTER TABLE public.household_bookings
  DROP CONSTRAINT IF EXISTS household_bookings_status_check;

ALTER TABLE public.household_bookings
  ADD CONSTRAINT household_bookings_status_check
  CHECK (status IN (
    'awaiting_payment',
    'pending',
    'accepted',
    'on_way',
    'in_progress',
    'completed',
    'cancelled'
  ));

-- 2. Allow anonymous bookings (customer_id IS NULL for public quick-bookings)
ALTER TABLE public.household_bookings
  ALTER COLUMN customer_id DROP NOT NULL;

-- 3. Make time_slot optional (NULL = flexible / not specified)
ALTER TABLE public.household_bookings
  ALTER COLUMN time_slot DROP NOT NULL;

-- 4. Allow inserts where customer_id is NULL (anonymous) or matches the caller
DROP POLICY IF EXISTS "Customers can create bookings" ON public.household_bookings;
CREATE POLICY "Customers can create bookings"
  ON public.household_bookings FOR INSERT
  WITH CHECK (
    customer_id IS NULL
    OR auth.uid() = customer_id
  );
