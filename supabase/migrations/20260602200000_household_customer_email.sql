ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS customer_email TEXT;
