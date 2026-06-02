-- ─── 1. Add email to household_helpers ──────────────────────────────────────
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS email TEXT;

-- ─── 2. Allow authenticated users to insert their own helper row ─────────────
-- Required when the auth account is created first (signUp → insert with user_id).
CREATE POLICY "helpers_insert_own_authenticated"
  ON public.household_helpers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── 3. Auto-increment accepted_count when a booking is claimed ──────────────
-- Keeps the dispatch priority counter (fewest jobs first) accurate without
-- requiring a client-side update after each accept.
CREATE OR REPLACE FUNCTION public.increment_helper_accepted_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.student_id IS NOT NULL
     AND (OLD.student_id IS NULL OR OLD.student_id != NEW.student_id)
     AND NEW.status = 'accepted' THEN
    UPDATE public.household_helpers
    SET accepted_count = accepted_count + 1
    WHERE user_id = NEW.student_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER household_booking_claimed
  AFTER UPDATE ON public.household_bookings
  FOR EACH ROW EXECUTE FUNCTION public.increment_helper_accepted_count();
