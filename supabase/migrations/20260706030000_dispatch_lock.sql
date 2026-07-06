-- No-spam dispatch: a short atomic claim so two dispatch invocations that
-- overlap (checkout-time dispatch racing a retry, or the admin re-dispatch
-- button racing the cron) can't both blast every helper with a duplicate
-- "new job" WhatsApp/SMS/email. dispatch-household-job claims the booking with
-- a conditional UPDATE on this column (null OR older than the lock window);
-- the loser bails. Re-dispatch rounds minutes apart pass normally.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS last_dispatched_at timestamptz;
