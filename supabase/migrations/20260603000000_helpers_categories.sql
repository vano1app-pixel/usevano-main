-- Add missing columns to household_helpers.
-- The create-helper-application edge function already submits these fields;
-- this migration makes the schema match so inserts succeed.

ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS categories     TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS age            INTEGER,
  ADD COLUMN IF NOT EXISTS bio            TEXT,
  ADD COLUMN IF NOT EXISTS tutor_subjects TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tutor_levels   TEXT[]  NOT NULL DEFAULT '{}';
