-- Arrival-code handshake: the two columns the household-arrival edge function
-- relies on but that no migration ever created. Without them the function
-- errors on a missing column the moment a helper taps "I've reached", so the
-- whole arrival-code handshake (and therefore starting any job) was broken.
--
--   arrival_attempts – wrong-code guess counter for anti-brute-force. The
--                      function locks verification after 5 misses; re-tapping
--                      "I've reached" issues a fresh code and resets this to 0.
--   arrived_at       – when the helper tapped "I've reached" (stamped with the
--                      generated code), for ordering / analytics.
--
-- Additive + IF NOT EXISTS, so it's safe to run on any database (including one
-- where the columns were already added by hand).

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS arrival_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrived_at       TIMESTAMPTZ;
