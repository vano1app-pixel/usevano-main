-- DIRECT-PAY MODEL (July 2026): Vano charges ONLY its booking fee (+ the
-- optional €2 Vano Cover add-on); the customer pays the student directly
-- (Revolut / cash) and the student keeps 100%. Two schema pieces make that
-- safe:
--
-- 1. household_helpers.payment_handle — how the customer pays the student
--    ("@revtag", an IBAN note, or "cash"). Shown on the customer's tracking
--    page at the pay-your-helper moment. Semi-public by design (it exists to
--    be shown to the paying customer).
--
-- 2. household_customer_ratings — the TWO-WAY review system. The helper
--    confirms "I was paid" (paid = true, optional stars) or reports
--    "customer didn't pay me" (paid = false = a STRIKE). Checkout blocks any
--    customer phone with >= 2 strikes until the owner clears them, so a
--    serial non-payer can't keep burning students. One row per booking.
--    Service-role writes only (via the household-arrival edge function,
--    which verifies the caller is the booking's assigned helper).

alter table public.household_helpers
  add column if not exists payment_handle text;

comment on column public.household_helpers.payment_handle is
  'How customers pay this helper directly (Revolut tag / IBAN note / "cash"). Direct-pay model: Vano never holds the job money.';

create table if not exists public.household_customer_ratings (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.household_bookings(id) on delete cascade,
  helper_id      uuid not null,
  customer_phone text not null,
  -- true  = helper confirms the customer paid them
  -- false = a strike: the customer did not pay
  paid           boolean not null,
  rating         int check (rating between 1 and 5),
  comment        text,
  created_at     timestamptz not null default now()
);

comment on table public.household_customer_ratings is
  'Helper -> customer reviews (direct-pay model): paid confirmation / unpaid strikes + optional stars. Written only by the household-arrival edge function (service role).';

create index if not exists household_customer_ratings_phone_idx
  on public.household_customer_ratings (customer_phone);

-- Service-role only: RLS on with no policies means anon/authenticated can
-- neither read nor write; the edge function (service role) bypasses RLS.
alter table public.household_customer_ratings enable row level security;
revoke all on public.household_customer_ratings from anon, authenticated;
