-- ── Security hardening, part 2 of 2 — the actual lockdown ──────────────────
-- ⚠️  DO NOT APPLY until the frontend from part 1 is deployed. The new
-- TrackBooking reads bookings + chat through get_household_booking() /
-- get_household_chat() and ActivityTicker uses recent_household_activity().
-- Applying this before that frontend is live will break the anonymous
-- tracking page (the old code does `.from('household_bookings').select('*')`,
-- which this policy drop revokes for the anon role).
--
-- After this runs, the ONLY way an anonymous caller can read a booking or its
-- chat is by presenting the exact booking id to the SECURITY DEFINER RPC — no
-- more bulk enumeration of customer PII with the public anon key.

-- C1: remove the bulk-read of every anonymous booking's PII.
drop policy if exists "Public can view anonymous bookings" on public.household_bookings;

-- C2: remove the global "read any chat" policy. Signed-in helpers keep reading
-- their own threads via "Parties read own booking chat" (added in part 1);
-- anonymous customers read via get_household_chat().
drop policy if exists "Anyone can read chat by booking id" on public.household_chat;
