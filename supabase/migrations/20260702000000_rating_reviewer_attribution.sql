-- Reviewer attribution for the homepage review wall: a first name (when the
-- customer gave one) and the booking's area, denormalized at rating time by
-- rate-household-booking so the anon-readable ratings table never needs a
-- join into bookings. Both nullable — old rows and name-less quick bookings
-- simply render as "VANO customer".
alter table public.household_ratings
  add column if not exists reviewer_name text,
  add column if not exists area text;
