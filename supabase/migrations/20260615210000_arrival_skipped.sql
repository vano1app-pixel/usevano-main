-- Arrival path: "Customer not available".
--
-- When a helper is physically at the address but the customer can't be reached
-- to read out their 4-digit arrival code, they can start the job without it
-- (household-arrival action 'start_without_code'). We flag those bookings so
-- the customer and admin know the job started without the proof-of-presence
-- handshake.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS arrival_skipped boolean NOT NULL DEFAULT false;
