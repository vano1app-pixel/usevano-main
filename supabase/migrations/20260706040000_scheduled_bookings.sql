-- Book-ahead done right. Until now scheduled_date was a free-text label
-- ('tomorrow', 'Tomorrow 9am') and every booking dispatched immediately, so a
-- job requested for tomorrow was offered to helpers NOW and auto-cancelled ~2h
-- later — days before it was due. This adds a real timestamp so future-dated
-- jobs dispatch at a lead window before the slot and are excluded from the
-- as-soon-as-possible auto-cancel.
--
-- scheduled_at NULL == ASAP (today's behaviour, unchanged) — only set when the
-- customer picks a future slot, so the blast radius is book-ahead only.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_reminded_at timestamptz;

CREATE INDEX IF NOT EXISTS household_bookings_scheduled_at_idx
  ON public.household_bookings (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

-- Cron: dispatch future-dated jobs when their lead window arrives, and remind
-- the assigned helper shortly before start. Scheduled every 5 min if absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-scheduled-jobs') THEN
    PERFORM cron.schedule('dispatch-scheduled-jobs', '*/5 * * * *', $cmd$
      SELECT net.http_post(
        url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/dispatch-scheduled-jobs',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1b21md2p0cHZxZWR3eGp4b2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc1NTgsImV4cCI6MjA5MDAyMzU1OH0.7Gf17HpzigLoAkJgERaWaitbfThp13oEDYK8-bM0vHY'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
      );
    $cmd$);
  END IF;
END $$;
