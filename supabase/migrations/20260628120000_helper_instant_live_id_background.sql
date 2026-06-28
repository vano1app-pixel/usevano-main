-- Instant-live helpers: go on the platform the moment student email + the €2
-- fee are done, with ID verification (Stripe Identity) finishing in the
-- background. ID no longer gates going live — it's enforced after the fact by a
-- grace window instead of an upfront block.
--
-- A helper who goes live before their ID clears gets `id_grace_until` stamped.
-- If ID still isn't verified when that lapses, the suspend-unverified-helpers
-- sweep pulls them to status 'id_overdue' (off the platform — no job offers, not
-- on the homepage) until they finish. Completing the ID check reinstates them
-- (handled in stripe-identity-webhook).
--
-- ⚠️ Deploy order: run this migration BEFORE deploying the updated functions.

ALTER TABLE household_helpers
  ADD COLUMN IF NOT EXISTS id_grace_until TIMESTAMPTZ;

-- Approve on student email + €2 only (ID dropped from the gate). When the helper
-- goes live without a verified ID yet, stamp the grace deadline so the sweep can
-- pull them later if they never finish it. The status='pending' guard still
-- means this never revives a suspended/rejected/id_overdue helper or re-touches
-- one that's already approved.
CREATE OR REPLACE FUNCTION household_helpers_autoapprove() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pending'
     AND NEW.student_email_verified
     AND NEW.signup_paid THEN
    NEW.status := 'approved';
    IF NOT NEW.id_verified AND NEW.id_grace_until IS NULL THEN
      NEW.id_grace_until := now() + interval '3 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- (trigger trg_helpers_autoapprove stays bound to this function via REPLACE.)

-- ─── Daily sweep: pull helpers who never finished their ID ──────────────────
-- Thin cron that pings the suspend-unverified-helpers edge function (anon key —
-- the function is idempotent and re-checks every row, so an unauthenticated
-- nudge is harmless). All selection logic lives in the function where it's
-- testable and bakes no service secret into SQL.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron not enabled — schedule suspend-unverified-helpers via Supabase Scheduled Functions (daily).';
    return;
  end if;
  begin
    perform cron.unschedule('suspend-unverified-helpers');
  exception when others then
    null; -- first run: nothing to unschedule
  end;
  perform cron.schedule(
    'suspend-unverified-helpers',
    '17 3 * * *', -- daily at 03:17
    $c$
    SELECT net.http_post(
      url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/suspend-unverified-helpers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1b21md2p0cHZxZWR3eGp4b2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc1NTgsImV4cCI6MjA5MDAyMzU1OH0.7Gf17HpzigLoAkJgERaWaitbfThp13oEDYK8-bM0vHY'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
    $c$
  );
end $$;
