-- Vano Pay deadline-aware auto-release. Adds an optional deadline
-- the hirer can set at checkout time (e.g. "due 5 May") so the
-- 14-day flat auto-release becomes deadline-aligned: freelancer gets
-- paid ~3 days after the work is due instead of waiting a fixed two
-- weeks regardless of job length.
--
-- Behaviour change is purely in the auto_release_at math computed by
-- the stripe-webhook handler when the row enters 'paid' state:
--   deadline_at IS NULL  → auto_release_at = now() + 14 days  (legacy)
--   deadline_at IS NOT NULL → auto_release_at =
--       LEAST( now() + 30 days,                -- 30-day ceiling
--              GREATEST( now() + 48 hours,     -- 48h floor for review
--                        deadline_at + 72 hours -- 3-day grace post-deadline
--              ))
--
-- Existing rows (deadline_at = NULL) keep behaving exactly as before;
-- this column is purely additive and never required. The auto-release
-- cron itself doesn't change — it queries auto_release_at, which is
-- already populated by the webhook.

ALTER TABLE public.vano_payments
  ADD COLUMN IF NOT EXISTS deadline_at timestamptz;

COMMENT ON COLUMN public.vano_payments.deadline_at IS
  'Optional hirer-supplied deadline for the work. When set, the stripe-webhook handler aligns auto_release_at to deadline + 72h grace (clamped to a 48h floor / 30-day ceiling from payment time) instead of the flat 14-day default. Null on legacy rows and on rows where the hirer skipped the deadline field.';
