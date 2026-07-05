-- Household winback: dormant one-off customers get a single category-timed
-- "need a hand again?" nudge from the household-winback edge function.
--
-- winback_sent_at stamps the customer's latest completed booking once the
-- lapse has been handled (nudged, unreachable, or too stale) so the cron
-- never considers the same lapse twice — the same close-out pattern as
-- rating_reminder_sent_at. A later booking starts a fresh unstamped cycle.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS winback_sent_at timestamptz;

-- Daily ping at 11:00 UTC (Irish lunchtime). Same thin-cron shape as
-- redispatch-stale-jobs: anon key only — the function is idempotent
-- (winback_sent_at close-out) and capped per run, so an unauthenticated
-- nudge is harmless, and no secrets are baked into SQL.
SELECT cron.schedule(
  'household-winback',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/household-winback',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1b21md2p0cHZxZWR3eGp4b2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc1NTgsImV4cCI6MjA5MDAyMzU1OH0.7Gf17HpzigLoAkJgERaWaitbfThp13oEDYK8-bM0vHY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
