-- HELPER SOS (July 2026): a panic button on the helper's job screen.
-- One tap opens the emergency sheet: "Call 999" (always first — VANO is not
-- an emergency service) and "Alert the VANO team", which records a row here
-- and pages the owner on every channel (WhatsApp + SMS + email) with the
-- helper's live location and the job details. "I'm safe now" resolves it.
--
-- Written ONLY by the household-arrival edge function (service role), which
-- verifies the caller is the booking's assigned helper. RLS on with no
-- policies: neither anon nor authenticated can read or write. That privacy is
-- deliberate — the customer must never learn an SOS was raised from their
-- booking (the customer may BE the reason it was pressed), so nothing about
-- these rows is ever surfaced on TrackBooking or written to
-- household_job_updates.

create table if not exists public.helper_sos_events (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.household_bookings(id) on delete cascade,
  -- auth.users id of the helper who raised it (matches household_bookings.student_id)
  helper_id   uuid not null,
  -- Best-effort fix captured at the moment of the tap (null when GPS was
  -- denied/unavailable — the alert still goes out with the job address).
  lat         double precision,
  lng         double precision,
  accuracy_m  double precision,
  -- 'active' until the helper taps "I'm safe now" (or the owner resolves it
  -- by hand after following up).
  status      text not null default 'active' check (status in ('active', 'resolved')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.helper_sos_events is
  'Helper panic-button ledger (SOS on the job screen). Service-role only via household-arrival; invisible to customers by design.';

create index if not exists helper_sos_events_booking_idx
  on public.helper_sos_events (booking_id);
create index if not exists helper_sos_events_active_idx
  on public.helper_sos_events (status) where status = 'active';

-- Service-role only: RLS on with no policies means anon/authenticated can
-- neither read nor write; the edge function (service role) bypasses RLS.
alter table public.helper_sos_events enable row level security;
revoke all on public.helper_sos_events from anon, authenticated;
