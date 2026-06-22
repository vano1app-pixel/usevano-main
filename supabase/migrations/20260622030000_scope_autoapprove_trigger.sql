-- Tighten the auto-approve trigger from 20260622020000.
--
-- The original fired BEFORE UPDATE on every column, re-evaluating the
-- three-flag predicate on any write to a helper row. That meant an unrelated
-- update to a still-pending helper who already had all three flags set
-- (e.g. the accepted_count increment, a profile edit, or an availability
-- toggle) could flip them to 'approved' as a side effect.
--
-- Scope it to fire ONLY when one of the three verification flags is in the
-- UPDATE's column list, and only on a pending row. Approval is now driven
-- exclusively by the verification writes (email OTP / Stripe Identity / payment
-- confirm), never by an incidental update.

DROP TRIGGER IF EXISTS trg_helpers_autoapprove ON household_helpers;
CREATE TRIGGER trg_helpers_autoapprove
  BEFORE UPDATE OF student_email_verified, id_verified, signup_paid ON household_helpers
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION household_helpers_autoapprove();
