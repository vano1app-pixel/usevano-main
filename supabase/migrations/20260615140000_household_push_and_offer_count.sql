-- Deliveroo-style tracking UX support:
--   1) household_push_subscriptions — web-push subscriptions keyed to a
--      booking (not a user), because household customers are usually
--      anonymous. The booking_id UUID is treated as a bearer secret, the
--      same model used for anonymous booking/chat reads.
--   2) household_offer_count() — a SECURITY DEFINER count of the offers sent
--      for a booking, so the tracking page can show a real "N helpers
--      notified" number without exposing the offer rows (which carry
--      helper_id) to anonymous clients.

-- ---------------------------------------------------------------------------
-- 1) Push subscriptions, keyed to booking_id
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES public.household_bookings(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, endpoint)
);

CREATE INDEX IF NOT EXISTS household_push_subscriptions_booking_idx
  ON public.household_push_subscriptions (booking_id);

ALTER TABLE public.household_push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Anonymous customers must be able to register a subscription for the booking
-- they're tracking. They hold the booking_id (a UUID secret), so we allow
-- inserts for any booking_id. Reads/sends are done only by the service role
-- (which bypasses RLS), so no SELECT policy is granted to anon/authenticated.
DROP POLICY IF EXISTS "Anyone can register a push subscription for a booking"
  ON public.household_push_subscriptions;
CREATE POLICY "Anyone can register a push subscription for a booking"
  ON public.household_push_subscriptions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2) Offer count for the "finding your helper" card
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so an anonymous tracking-page client can read the count
-- without a SELECT policy on household_job_offers itself (those rows carry
-- helper_id and stay private). Returns just an integer.
CREATE OR REPLACE FUNCTION public.household_offer_count(p_booking_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.household_job_offers
  WHERE booking_id = p_booking_id;
$$;

GRANT EXECUTE ON FUNCTION public.household_offer_count(uuid) TO anon, authenticated;
