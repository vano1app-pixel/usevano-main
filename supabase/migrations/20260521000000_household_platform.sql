-- ════════════════════════════════════════════════════════════════════
-- Phase 6: Household platform tables
-- ════════════════════════════════════════════════════════════════════

-- 1. Expand profiles.user_type to include 'customer'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_user_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type IN ('student', 'business', 'customer'));

-- 2. household_customers
CREATE TABLE public.household_customers (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_address  TEXT,
  default_phone    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own record"
  ON public.household_customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Customers can upsert own record"
  ON public.household_customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Customers can update own record"
  ON public.household_customers FOR UPDATE
  USING (auth.uid() = user_id);

-- 3. household_students
CREATE TABLE public.household_students (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_available    BOOLEAN NOT NULL DEFAULT true,
  categories      TEXT[] NOT NULL DEFAULT '{}',
  bio             TEXT,
  rating_avg      NUMERIC(3,2),
  jobs_completed  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read household students"
  ON public.household_students FOR SELECT
  USING (true);

CREATE POLICY "Students can upsert own household profile"
  ON public.household_students FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update own household profile"
  ON public.household_students FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. household_bookings
CREATE TABLE public.household_bookings (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                UUID NOT NULL REFERENCES auth.users(id),
  student_id                 UUID REFERENCES auth.users(id),
  category                   TEXT NOT NULL,
  scheduled_date             TEXT NOT NULL,
  time_slot                  TEXT NOT NULL CHECK (time_slot IN ('morning', 'afternoon', 'evening')),
  is_express                 BOOLEAN NOT NULL DEFAULT false,
  pricing_type               TEXT CHECK (pricing_type IN ('flat', 'hourly')),
  price_estimate_cents       INTEGER,
  status                     TEXT NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','accepted','on_way','in_progress','completed','cancelled')),
  customer_name              TEXT NOT NULL,
  customer_address           TEXT NOT NULL,
  customer_phone             TEXT NOT NULL,
  booking_data               JSONB NOT NULL DEFAULT '{}',
  stripe_payment_intent_id   TEXT,
  stripe_capture_at          TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_bookings ENABLE ROW LEVEL SECURITY;

CREATE INDEX household_bookings_customer_idx ON public.household_bookings (customer_id);
CREATE INDEX household_bookings_student_idx  ON public.household_bookings (student_id);
CREATE INDEX household_bookings_status_idx   ON public.household_bookings (status);

CREATE POLICY "Booking parties can read bookings"
  ON public.household_bookings FOR SELECT
  USING (auth.uid() = customer_id OR auth.uid() = student_id);

CREATE POLICY "Customers can create bookings"
  ON public.household_bookings FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

CREATE POLICY "Parties can update assigned booking"
  ON public.household_bookings FOR UPDATE
  USING (auth.uid() = student_id OR auth.uid() = customer_id);

CREATE OR REPLACE FUNCTION public.touch_household_booking()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER household_booking_updated
  BEFORE UPDATE ON public.household_bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_household_booking();

-- 5. household_job_updates
CREATE TABLE public.household_job_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES public.household_bookings(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('accepted','on_way','arrived','in_progress','completed','cancelled')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_job_updates ENABLE ROW LEVEL SECURITY;

CREATE INDEX household_job_updates_booking_idx ON public.household_job_updates (booking_id);

CREATE POLICY "Booking parties can read job updates"
  ON public.household_job_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.student_id = auth.uid())
    )
  );

CREATE POLICY "Students can insert job updates"
  ON public.household_job_updates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_bookings b
      WHERE b.id = booking_id AND b.student_id = auth.uid()
    )
  );

-- 6. household_chat
CREATE TABLE public.household_chat (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES public.household_bookings(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_chat ENABLE ROW LEVEL SECURITY;

CREATE INDEX household_chat_booking_idx ON public.household_chat (booking_id, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.household_chat;

CREATE POLICY "Booking parties can read chat"
  ON public.household_chat FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.student_id = auth.uid())
    )
  );

CREATE POLICY "Booking parties can send messages"
  ON public.household_chat FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.household_bookings b
      WHERE b.id = booking_id
        AND (b.customer_id = auth.uid() OR b.student_id = auth.uid())
    )
  );

-- 7. household_payouts
CREATE TABLE public.household_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          UUID NOT NULL REFERENCES public.household_bookings(id),
  student_id          UUID NOT NULL REFERENCES auth.users(id),
  amount_cents        INTEGER NOT NULL,
  stripe_transfer_id  TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','transferred','failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_payouts ENABLE ROW LEVEL SECURITY;

CREATE INDEX household_payouts_student_idx ON public.household_payouts (student_id);

CREATE POLICY "Students can read own payouts"
  ON public.household_payouts FOR SELECT
  USING (auth.uid() = student_id);
