-- Replace the broken stuck-booking redispatch.
--
-- The old household_redispatch_stuck() SQL function (a) embedded a stale
-- service-role JWT in its source, and (b) fired net.http_post with the 5s
-- default timeout, which aborted before dispatch responded — net._http_response
-- showed every call timing out, and a real booking sat unoffered for hours.
-- The dispatch logic itself also couldn't revive expired offers (fixed in the
-- dispatch-household-job upsert).
--
-- New shape: a thin cron that pings the redispatch-stale-jobs edge function
-- (anon key — the function is idempotent and capped, so an unauthenticated
-- nudge is harmless) with a 15s timeout. All selection/caps live in the
-- function where they're testable and don't bake secrets into SQL.

SELECT cron.unschedule('redispatch-stuck-household-bookings');
DROP FUNCTION IF EXISTS public.household_redispatch_stuck();

SELECT cron.schedule(
  'redispatch-stale-jobs',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/redispatch-stale-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1b21md2p0cHZxZWR3eGp4b2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc1NTgsImV4cCI6MjA5MDAyMzU1OH0.7Gf17HpzigLoAkJgERaWaitbfThp13oEDYK8-bM0vHY'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $$
);
