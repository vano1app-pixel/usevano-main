-- Foundation for scaling VANO Household across Ireland.
--
-- Changes:
--   1. Add `city` to household_bookings (defaults to 'Galway' so existing rows are safe)
--   2. Create household_helpers — proper helper roster replacing helper_applications
--   3. Create household_job_offers — dispatch queue (Uber-style offer/accept)

-- ─── 1. City on bookings ────────────────────────────────────────────────────
ALTER TABLE household_bookings
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT 'Galway';

-- ─── 2. Household helpers ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_helpers (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  name           TEXT        NOT NULL,
  phone          TEXT        NOT NULL,
  photo_url      TEXT,
  city           TEXT        NOT NULL,
  areas_served   TEXT[]      NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'pending',   -- pending | approved | suspended
  is_available   BOOLEAN     NOT NULL DEFAULT FALSE,
  accepted_count INT         NOT NULL DEFAULT 0,
  rating_avg     NUMERIC(3,2)
);

ALTER TABLE household_helpers ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors can apply
CREATE POLICY "anon_insert_household_helpers"
  ON household_helpers FOR INSERT TO anon
  WITH CHECK (true);

-- Helpers cannot read each other's rows via the anon key
-- (service role / admin reads all)

-- ─── 3. Job offers (dispatch queue) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS household_job_offers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  booking_id  UUID        NOT NULL REFERENCES household_bookings(id) ON DELETE CASCADE,
  helper_id   UUID        NOT NULL REFERENCES household_helpers(id)  ON DELETE CASCADE,
  offered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,                                -- NULL = no expiry for now
  status      TEXT        NOT NULL DEFAULT 'pending'      -- pending | accepted | declined | expired
);

ALTER TABLE household_job_offers ENABLE ROW LEVEL SECURITY;

-- Helpers can read their own offers (when we add auth to helper accounts)
-- For now service role manages all writes; anon gets nothing.
