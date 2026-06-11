-- Tracks the one-time "how was your helper?" reminder email so the
-- remind-household-rating cron never emails the same booking twice.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS rating_reminder_sent_at timestamptz;
