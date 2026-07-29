-- Customer-trust: surface the "student" in every helper profile.
-- "Student" is VANO's entire trust pitch, yet college lived only inside the
-- service-role-only application_data JSONB (alongside DOB — which is why that
-- JSONB itself must never be granted to anon). Promote the three
-- customer-safe study fields to real columns so the profile page, homepage
-- cards, the /track helper chip and the accept email can say
-- "2nd year Nursing at ATU" instead of just a first name and an age.
--
-- APPLIED TO LIVE via MCP on 2026-07-29 — kept here so the migration history
-- matches production (migrations are manual-apply by policy; see the deploy
-- workflow header).

ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS college    text,
  ADD COLUMN IF NOT EXISTS course     text,
  ADD COLUMN IF NOT EXISTS study_year text;

-- Anon reads are column-scoped (20260610) — these three are customer-facing
-- display data; additive grant, same pattern as 20260708000000.
GRANT SELECT (college, course, study_year) ON public.household_helpers TO anon;

-- The dashboard profile sheet updates its own row directly under the
-- column-scoped UPDATE grant from 20260717010000 — extend it with the three
-- new self-descriptive fields. Like bio, they can't grant verification or
-- the tick.
GRANT UPDATE (college, course, study_year) ON public.household_helpers TO authenticated;

-- Backfill from the join-form answers already sitting in application_data
-- (college has been required at signup since the multi-step form; course/year
-- were accepted server-side but never sent by the form, so mostly null).
UPDATE public.household_helpers
SET college    = COALESCE(college,    NULLIF(application_data->>'college', '')),
    course     = COALESCE(course,     NULLIF(application_data->>'course', '')),
    study_year = COALESCE(study_year, NULLIF(application_data->>'year', ''))
WHERE application_data IS NOT NULL;
