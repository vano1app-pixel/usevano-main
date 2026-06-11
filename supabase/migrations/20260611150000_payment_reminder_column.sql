-- One-shot payment reminder for pay-after-accept bookings.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS payment_reminder_sent_at timestamptz;

-- Cron: remind customers 30 min after a helper accepted if still unpaid.
-- (Applied directly in production via cron.schedule; kept here for record.)
-- SELECT cron.schedule('remind-unpaid-bookings', '*/15 * * * *',
--   $$ SELECT net.http_post(
--        url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/remind-unpaid-bookings',
--        headers := jsonb_build_object('Content-Type','application/json'),
--        body := '{}'::jsonb); $$);
