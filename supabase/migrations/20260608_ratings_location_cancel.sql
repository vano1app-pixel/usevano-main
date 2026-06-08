-- Location freshness: lets TrackBooking show a real "updated Xs ago" label
-- based on when the helper last pushed their GPS coords.
ALTER TABLE public.household_bookings
  ADD COLUMN IF NOT EXISTS worker_location_updated_at timestamptz;

-- Ratings table: one rating per booking, anonymous customers.
CREATE TABLE IF NOT EXISTS public.household_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.household_bookings(id) ON DELETE CASCADE,
  helper_id   uuid REFERENCES public.household_helpers(id),
  rating      int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id)
);

ALTER TABLE public.household_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read ratings"    ON public.household_ratings FOR SELECT USING (true);
CREATE POLICY "Anyone can insert a rating" ON public.household_ratings FOR INSERT WITH CHECK (true);

-- Denormalized average on helpers for fast display on the dashboard.
ALTER TABLE public.household_helpers
  ADD COLUMN IF NOT EXISTS average_rating  numeric(3,1),
  ADD COLUMN IF NOT EXISTS rating_count    int NOT NULL DEFAULT 0;
