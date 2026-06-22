-- Helper application fields captured by the redesigned multi-step join form.
--
-- The structured fields the platform already reads (areas_served, availability)
-- keep their own columns; everything new the form now asks for — date of birth,
-- college, course, year, transport, student email and the consent flags — lands
-- in a single JSONB blob so signups capture it all without a wide schema change.
--
-- Verification *status* columns (student-email confirmed, Stripe Identity result)
-- are intentionally NOT added here — they belong with the verification backend,
-- which is the next piece of work. This migration only stores what the new form
-- collects today.
--
-- ⚠️ Deploy order: run this migration BEFORE deploying the updated
-- create-helper-application function, otherwise inserts that write
-- application_data will fail.

ALTER TABLE household_helpers
  ADD COLUMN IF NOT EXISTS application_data JSONB;
