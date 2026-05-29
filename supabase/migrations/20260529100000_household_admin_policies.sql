-- Allow admins to read and manage all household data via the client.
-- The dispatch and capture edge functions use service role (bypasses RLS),
-- but the Admin dashboard at /admin reads via the user's anon-key session,
-- so these policies are needed to avoid empty results.

-- household_bookings: admin read
CREATE POLICY "Admins can read all household bookings"
  ON public.household_bookings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- household_bookings: admin update (mark complete, reassign status)
CREATE POLICY "Admins can update household bookings"
  ON public.household_bookings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- household_helpers: admin read (approve/suspend queue)
CREATE POLICY "Admins can read all household helpers"
  ON public.household_helpers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- household_helpers: admin update (approve / suspend)
CREATE POLICY "Admins can update household helpers"
  ON public.household_helpers FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- household_job_offers: admin read (see dispatch state for each booking)
ALTER TABLE public.household_job_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all household job offers"
  ON public.household_job_offers FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
