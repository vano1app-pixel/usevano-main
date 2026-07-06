-- Helper-side autonomy: nudge tracking so nudge-helper-onboarding can chase
-- two silent drop-offs without an owner and without spamming.
--
--   • payout_onboarding_reminded_at / count — an APPROVED helper who has earned
--     money (a pending household_payouts row) but hasn't finished Stripe Connect
--     onboarding gets a few escalating "add your bank details, €X is waiting"
--     nudges. Today nobody chases this; earnings pile up 'pending' forever.
--   • application_nudged_at / count — a PENDING applicant who stalled partway
--     through the 3 gates (email OTP / ID / €2) gets a step-aware "you're almost
--     in" nudge. Today an interrupted 2am signup is silently lost.
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS payout_onboarding_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payout_onboarding_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS application_nudged_at timestamptz,
  ADD COLUMN IF NOT EXISTS application_nudge_count integer NOT NULL DEFAULT 0;

-- Schedule the combined nudge cron (hourly) if it isn't already present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nudge-helper-onboarding') THEN
    PERFORM cron.schedule('nudge-helper-onboarding', '30 * * * *', $cmd$
      SELECT net.http_post(
        url := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/nudge-helper-onboarding',
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
