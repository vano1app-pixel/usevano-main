-- Allow unauthenticated users to read their own anonymous booking by ID.
-- Anonymous bookings (customer_id IS NULL) are created via the card-payment
-- quick-booking flow. After Stripe redirects to /track/{id}?paid=true the
-- customer is not logged in, so they need anon-key SELECT access.
-- The UUID is 128-bit random — effectively unguessable — so this is safe.

CREATE POLICY "Public can view anonymous bookings"
  ON public.household_bookings FOR SELECT
  USING (customer_id IS NULL);
