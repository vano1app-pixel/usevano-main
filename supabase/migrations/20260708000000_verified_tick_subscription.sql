-- Free-to-join + paid ✓: signing up now puts a helper live immediately (no €2
-- gate), and the blue "VANO Verified" tick becomes: confirmed student email
-- + Stripe Identity ID check + an active €2/month plan.
--
-- Why: the €2 gate was the single biggest drop-off in the helper funnel
-- (9 of 12 applications sat stalled at it). Free join maximises supply; the
-- tick keeps a real perk (dispatch offers jobs to vano_verified helpers
-- first) so the €2/month has something genuine to buy. The one-off-€2 model
-- lives on only as history: signup_paid stays for the grandfather rule and
-- the legacy trigger/webhook paths stay deployed but idle.
--
-- APPLIED TO LIVE via MCP on 2026-07-07 — kept here so local/dev databases
-- and the migration history match production.

ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS verified_plan_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_plan_sub_id text;

-- The tick's definition lives in ONE place so dispatch ordering, the public
-- profile and the helper's own account can never disagree about it.
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS vano_verified boolean GENERATED ALWAYS AS (
    COALESCE(student_email_verified, false)
    AND COALESCE(id_verified, false)
    AND COALESCE(verified_plan_active, false)
  ) STORED;

-- Anon SELECT on this table is column-scoped (phone/email are revoked); the
-- two customer-safe new columns need explicit grants for the frontend reads.
-- verified_plan_sub_id stays service-role-only.
GRANT SELECT (verified_plan_active, vano_verified) ON public.household_helpers TO anon;

-- Grandfather: helpers who paid the one-off €2 under pay-to-join bought their
-- place under the old deal — their plan is treated as active for free.
UPDATE public.household_helpers
SET verified_plan_active = true
WHERE signup_paid = true;

-- Free-to-join sweep: applications stalled at the old €2 gate go live now
-- (matching what create-helper-application does for new sign-ups).
UPDATE public.household_helpers
SET status = 'approved', is_available = true
WHERE status = 'pending';
