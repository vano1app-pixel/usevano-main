-- Verification backend for helper signups: student-email OTP + Stripe Identity.
--
-- ⚠️ Deploy order: run this migration BEFORE deploying the new verification
-- functions, so the columns/table they write already exist.

-- Result flags + Stripe Identity bookkeeping on the helper row. Queried to show
-- a "Verified" badge and to decide who can go live. Defaults leave every
-- existing/pending helper unverified until they pass the checks.
ALTER TABLE household_helpers
  ADD COLUMN IF NOT EXISTS student_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS id_verified            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS identity_session_id    TEXT,
  ADD COLUMN IF NOT EXISTS identity_status        TEXT;

-- Short-lived one-time codes for student-email verification. Written and read
-- only by edge functions (service role). RLS is ON with NO policies, so the
-- anon/auth client cannot read codes — the table is invisible to the browser.
CREATE TABLE IF NOT EXISTS helper_email_otps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id  UUID        NOT NULL REFERENCES household_helpers(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  code_hash  TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS helper_email_otps_helper_idx
  ON helper_email_otps (helper_id, created_at DESC);

ALTER TABLE helper_email_otps ENABLE ROW LEVEL SECURITY;
-- intentionally no policies: only the service role (which bypasses RLS) touches it
