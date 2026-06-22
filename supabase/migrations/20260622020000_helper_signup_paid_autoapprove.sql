-- Gate platform access on all three signup checks: verified student email,
-- verified ID, and the paid €2 fee. A pending helper auto-approves the moment
-- all three are true — no manual review.
--
-- ⚠️ Deploy order: run this migration BEFORE deploying the updated functions.

ALTER TABLE household_helpers
  ADD COLUMN IF NOT EXISTS signup_paid BOOLEAN NOT NULL DEFAULT FALSE;

-- BEFORE UPDATE trigger: flip pending → approved once all three checks pass.
-- The status='pending' guard means it never revives a suspended/rejected
-- helper or re-touches one that's already approved, and it ignores every
-- other update (availability toggles, profile edits, etc.). Existing helpers
-- are left exactly as they are — none of them have these flags set.
CREATE OR REPLACE FUNCTION household_helpers_autoapprove() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pending'
     AND NEW.student_email_verified
     AND NEW.id_verified
     AND NEW.signup_paid THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_helpers_autoapprove ON household_helpers;
CREATE TRIGGER trg_helpers_autoapprove
  BEFORE UPDATE ON household_helpers
  FOR EACH ROW EXECUTE FUNCTION household_helpers_autoapprove();
