-- Self-healing money engine — schema support for:
--   • release-household-payouts: cap + surface a persistently failing transfer
--   • sweep-stalled-jobs: detect a PAID job whose helper accepted then ghosted
--   • reproducible cron schedules (the money/dispatch sweeps were only wired in
--     the dashboard, so a project restore would silently drop them)
--
-- All additive + idempotent; safe to re-run.

-- ── Payout failure tracking ────────────────────────────────────────────────
-- Today a transfer that keeps failing for a non-onboarding reason (unsettled
-- balance, destination restriction) loops on the cron forever, invisibly. Add
-- an attempt counter + last error + an "alerted the owner" stamp so the sweep
-- can cap retries and page the owner exactly once.
ALTER TABLE public.household_payouts
  ADD COLUMN IF NOT EXISTS transfer_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_transfer_error text,
  ADD COLUMN IF NOT EXISTS stuck_alerted_at timestamptz;

-- ── Stalled-paid-job sweep idempotency ─────────────────────────────────────
-- A booking that is PAID + 'accepted'/'on_way' but whose helper never advanced
-- to 'arrived' is matched by no existing cron. sweep-stalled-jobs first pings
-- the helper (stamp), then after a grace window auto-releases + re-dispatches.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS stalled_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stalled_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS stalled_escalated_at timestamptz;

-- ── Reproducible cron schedules ────────────────────────────────────────────
-- These sweeps were created by hand in the Supabase dashboard, so they live
-- nowhere in the repo and vanish on a restore. Schedule any that are MISSING
-- (guarded on cron.job.jobname) so a fresh database self-heals to the same
-- state WITHOUT disturbing the currently-running dashboard jobs. Uses the same
-- anon-key net.http_post pattern as 20260612_redispatch_cron.sql — every target
-- is idempotent + capped, so an unauthenticated nudge is harmless.
-- NB: params are prefixed p_ so the `WHERE jobname = p_job` predicate can't be
-- read as the cron.job table column (an unprefixed `job` is ambiguous with the
-- cron.job relation and errors at call time — caught during deploy).
CREATE OR REPLACE FUNCTION public._vano_ensure_cron(p_job text, p_sched text, p_fn text)
RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = p_job) THEN
    PERFORM cron.schedule(p_job, p_sched, format(
      $cmd$SELECT net.http_post(
        url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/%s',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1b21md2p0cHZxZWR3eGp4b2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc1NTgsImV4cCI6MjA5MDAyMzU1OH0.7Gf17HpzigLoAkJgERaWaitbfThp13oEDYK8-bM0vHY'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
      );$cmd$, p_fn));
  END IF;
END;
$fn$;

SELECT public._vano_ensure_cron('sweep-stalled-jobs',            '*/15 * * * *', 'sweep-stalled-jobs');
SELECT public._vano_ensure_cron('release-household-payouts',     '*/15 * * * *', 'release-household-payouts');
SELECT public._vano_ensure_cron('remind-confirm-completion',     '*/15 * * * *', 'remind-confirm-completion');
SELECT public._vano_ensure_cron('remind-unpaid-bookings',        '*/15 * * * *', 'remind-unpaid-bookings');
SELECT public._vano_ensure_cron('no-helper-fallback',            '*/30 * * * *', 'no-helper-fallback');
SELECT public._vano_ensure_cron('notify-household-no-helpers',   '*/5 * * * *',  'notify-household-no-helpers');
SELECT public._vano_ensure_cron('expire-household-offers',       '*/5 * * * *',  'expire-household-offers');
SELECT public._vano_ensure_cron('send-household-progress-emails','*/10 * * * *', 'send-household-progress-emails');
SELECT public._vano_ensure_cron('remind-household-rating',       '15 * * * *',   'remind-household-rating');
SELECT public._vano_ensure_cron('household-winback',             '0 11 * * *',   'household-winback');

DROP FUNCTION public._vano_ensure_cron(text, text, text);
