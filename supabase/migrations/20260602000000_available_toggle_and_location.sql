-- ─── 1. Link helpers to auth accounts (for availability toggle) ──────────────
-- Adds user_id so an authenticated worker can manage their own is_available flag.
-- NULL until admin links the record after approving the helper.
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS household_helpers_user_id_idx
  ON public.household_helpers (user_id)
  WHERE user_id IS NOT NULL;

-- Allow helpers to read their own row (for dashboard toggle)
CREATE POLICY "helpers_read_own"
  ON public.household_helpers FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Allow helpers to toggle their own availability only
CREATE POLICY "helpers_update_own_availability"
  ON public.household_helpers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 2. Worker location columns on bookings ───────────────────────────────────
-- Captured once when the worker taps "I'm on my way" — a static pin, not live GPS.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS worker_lat NUMERIC(9, 6),
  ADD COLUMN IF NOT EXISTS worker_lng NUMERIC(9, 6);

-- ─── 3. Publish household_bookings to Supabase Realtime ──────────────────────
-- Required for TrackBooking's postgres_changes subscription to receive status
-- and location updates in real time.
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_bookings;
