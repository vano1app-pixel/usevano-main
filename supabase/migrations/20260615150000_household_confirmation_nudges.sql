-- Confirmation nudges for jobs awaiting the customer's "mark complete".
--
-- We never auto-pay, so a customer who forgets to confirm would otherwise leave
-- the helper unpaid forever. These columns drive a human-in-the-loop net:
--   helper_finished_at     – the helper tapped "I've finished" (asks the
--                            customer to confirm; lets timed jobs be confirmed
--                            before the timer ends).
--   completion_reminded_at – we reminded the customer to confirm (once).
--   completion_escalated_at– we alerted an admin to follow up (once).
-- Nothing here moves money; payout still only happens when the customer
-- explicitly marks the job complete.

ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS helper_finished_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_reminded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_escalated_at TIMESTAMPTZ;
