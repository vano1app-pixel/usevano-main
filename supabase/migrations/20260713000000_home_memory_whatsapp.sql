-- Home memory + the WhatsApp door.
--
-- Customers stay anonymous (no auth.users row — identity is the phone
-- number), but until now everything Vano knew about a home lived in the
-- customer's OWN browser (bookingMemory.ts localStorage). That memory dies
-- with the device, so the platform could never say "welcome back" or offer
-- "same again?" on a new channel. These tables move the memory server-side:
--
--   • household_homes — ONE row per home, keyed on the E.164 phone. Written
--     fail-soft by create-household-payment-checkout on every booking (web
--     and WhatsApp alike) via record_home_booking(), and read by
--     whatsapp-inbound to greet returning homes, reuse the saved address and
--     offer the last job again. Also carries the WhatsApp opt-out flag
--     (STOP compliance) — a home that opted out is never messaged again.
--
--   • wa_threads — the WhatsApp conversation state machine, one row per
--     phone. Holds the in-progress booking draft (category, size, address…)
--     between messages. Rows are treated as expired after 30 minutes by the
--     function (checked in code against updated_at — no cron needed).
--
-- Both tables are SERVICE-ROLE ONLY: RLS enabled with no policies, so the
-- anon/authenticated keys can't read a home's address book or an open
-- conversation. Only edge functions (service key) touch them.

CREATE TABLE IF NOT EXISTS public.household_homes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone            text NOT NULL UNIQUE,      -- E.164 (+3538…)
  name             text,
  address          text,
  lat              double precision,
  lng              double precision,
  city             text,
  email            text,
  access_notes     text,                      -- future: "key under the pot" etc.
  last_category    text,
  last_size_label  text,
  last_booking_id  uuid,
  last_booked_at   timestamptz,
  bookings_count   integer NOT NULL DEFAULT 0,
  wa_opted_out     boolean NOT NULL DEFAULT false,
  wa_last_inbound_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.household_homes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.wa_threads (
  phone      text PRIMARY KEY,                -- E.164
  state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_threads ENABLE ROW LEVEL SECURITY;

-- Atomic "this home just booked" upsert, called fail-soft by
-- create-household-payment-checkout after the booking row is inserted.
-- COALESCE keeps existing details when a later booking omits them (e.g. a
-- WhatsApp booking with no email must not blank the email a web booking
-- saved), while last_* always reflect the newest booking. Empty strings are
-- treated as "not provided".
CREATE OR REPLACE FUNCTION public.record_home_booking(
  p_phone       text,
  p_name        text,
  p_address     text,
  p_lat         double precision,
  p_lng         double precision,
  p_city        text,
  p_email       text,
  p_category    text,
  p_size_label  text,
  p_booking_id  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_phone IS NULL OR btrim(p_phone) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.household_homes AS h
    (phone, name, address, lat, lng, city, email,
     last_category, last_size_label, last_booking_id, last_booked_at, bookings_count)
  VALUES
    (btrim(p_phone), NULLIF(btrim(coalesce(p_name, '')), ''),
     NULLIF(btrim(coalesce(p_address, '')), ''), p_lat, p_lng,
     NULLIF(btrim(coalesce(p_city, '')), ''), NULLIF(btrim(coalesce(p_email, '')), ''),
     p_category, NULLIF(btrim(coalesce(p_size_label, '')), ''), p_booking_id, now(), 1)
  ON CONFLICT (phone) DO UPDATE SET
    name            = COALESCE(NULLIF(btrim(coalesce(excluded.name, '')), ''), h.name),
    address         = COALESCE(NULLIF(btrim(coalesce(excluded.address, '')), ''), h.address),
    lat             = COALESCE(excluded.lat, h.lat),
    lng             = COALESCE(excluded.lng, h.lng),
    city            = COALESCE(NULLIF(btrim(coalesce(excluded.city, '')), ''), h.city),
    email           = COALESCE(NULLIF(btrim(coalesce(excluded.email, '')), ''), h.email),
    last_category   = excluded.last_category,
    last_size_label = excluded.last_size_label,
    last_booking_id = excluded.last_booking_id,
    last_booked_at  = now(),
    bookings_count  = h.bookings_count + 1,
    updated_at      = now();
END;
$$;

-- Service-role only — this writes customer PII, so neither anon nor
-- signed-in helpers may call it.
REVOKE EXECUTE ON FUNCTION public.record_home_booking(
  text, text, text, double precision, double precision,
  text, text, text, text, uuid
) FROM public, anon, authenticated;
