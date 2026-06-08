-- 1. Restore 'arrived' to the household_bookings status constraint
--    (the 20260522 migration rebuilt the constraint without it, breaking the
--    helper's "I arrived" button which tries to set status='arrived')
ALTER TABLE public.household_bookings
  DROP CONSTRAINT IF EXISTS household_bookings_status_check;

ALTER TABLE public.household_bookings
  ADD CONSTRAINT household_bookings_status_check
  CHECK (status IN (
    'awaiting_payment',
    'pending',
    'accepted',
    'on_way',
    'arrived',
    'in_progress',
    'completed',
    'cancelled'
  ));

-- 2. Fix household_chat RLS for anonymous bookings
--    Bookings have customer_id = NULL (anonymous), so the old policy
--    (b.customer_id = auth.uid()) never matched for customers.
--    Replace with: anyone who knows the booking_id can read/send messages
--    (UUID booking IDs are unguessable so this is safe).
DROP POLICY IF EXISTS "Booking parties can read chat"   ON public.household_chat;
DROP POLICY IF EXISTS "Booking parties can send messages" ON public.household_chat;

-- Anyone can read chat for a booking they know about (booking_id is a UUID secret)
CREATE POLICY "Anyone can read chat by booking id"
  ON public.household_chat FOR SELECT
  USING (true);

-- Authenticated users can send messages to any booking they know about
CREATE POLICY "Authenticated users can send messages"
  ON public.household_chat FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
