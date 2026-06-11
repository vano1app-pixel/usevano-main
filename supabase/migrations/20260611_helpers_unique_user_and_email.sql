-- Hard guarantee against duplicate helper accounts: one row per auth user
-- and one row per email. (The signup edge function also dedupes by
-- phone/email before inserting — this is the belt-and-braces DB layer.)
-- Existing duplicate rows were merged/removed before this was applied.
CREATE UNIQUE INDEX IF NOT EXISTS household_helpers_user_id_unique
  ON public.household_helpers (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS household_helpers_email_unique
  ON public.household_helpers (lower(email)) WHERE email IS NOT NULL;
