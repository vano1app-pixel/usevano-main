-- Track when we've sent the "your Vano Pay payment auto-releases in N
-- days" reminder so the remind-held-payments cron only emails each
-- held payment once. Without this column the cron would re-email
-- every day inside the reminder window — one email per held row per
-- day, a miserable experience for hirers holding multiple payments.
--
-- Nullable so pre-existing held rows aren't retroactively flagged as
-- "already reminded" (we still want to reminder them through the
-- next cron sweep).

ALTER TABLE public.vano_payments
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

COMMENT ON COLUMN public.vano_payments.reminder_sent_at IS
  'When the pre-auto-release reminder email was sent to the hirer. Null until the remind-held-payments cron fires. Prevents duplicate reminders.';

-- Partial index scoped to the exact slice the cron queries: held,
-- not disputed, not yet reminded, not yet auto-released. Keeps the
-- nightly scan cheap regardless of how large vano_payments grows.
CREATE INDEX IF NOT EXISTS vano_payments_reminder_due_idx
  ON public.vano_payments (auto_release_at)
  WHERE status = 'paid'
    AND auto_release_at IS NOT NULL
    AND reminder_sent_at IS NULL
    AND dispute_reason IS NULL;

-- SECURITY DEFINER helper so the remind-held-payments edge function
-- (and any future batch-email sender) can resolve auth.users.email
-- for a known list of user_ids in one round-trip. Service role only —
-- the REVOKE below locks it from anon/authenticated so a client SDK
-- can't turn this into a user-email enumeration attack.
CREATE OR REPLACE FUNCTION public.get_user_emails(user_ids uuid[])
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id AS user_id, u.email::text AS email
  FROM auth.users u
  WHERE u.id = ANY(user_ids);
$$;

REVOKE ALL ON FUNCTION public.get_user_emails(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_emails(uuid[]) TO service_role;

COMMENT ON FUNCTION public.get_user_emails(uuid[]) IS
  'Service-role-only batch lookup of auth.users.email by id. Used by the Vano Pay reminder cron. REVOKE blocks anon/authenticated so the client SDK can''t enumerate emails.';
