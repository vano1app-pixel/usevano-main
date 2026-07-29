-- Security hardening (2026-07-29) — re-scope household_chat INSERT to booking
-- parties.
--
-- FINDING: migration 20260608_fix_arrived_status_and_chat_rls.sql (fixing chat
-- for anonymous customers) replaced the party-scoped INSERT policy with
--     WITH CHECK (auth.uid() = sender_id)
-- whose ONLY constraint is that the sender stamps their own uid. It never checks
-- the sender is actually a party to booking_id. Any authenticated user (i.e. any
-- helper) who knows a booking's UUID — e.g. from a dispatch offer they were sent
-- but never accepted — can INSERT a message into that booking's thread. The
-- customer reads the thread via get_household_chat (anon SECURITY DEFINER, which
-- returns every message for the booking), so the injected message renders on the
-- customer's live /track page: a payment-redirection / impersonation vector
-- against a customer the helper is not assigned to.
--
-- FIX: require the sender to be the assigned helper (or the — normally
-- anonymous — customer) on that booking, mirroring the SELECT intent. Anonymous
-- customers send via service-role paths, not this authenticated policy, so this
-- does not affect them; the assigned helper's own messages keep working.

drop policy if exists "Authenticated users can send messages" on public.household_chat;

create policy "Booking parties can send messages"
  on public.household_chat for insert to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.household_bookings b
      where b.id = household_chat.booking_id
        and (b.student_id = auth.uid() or b.customer_id = auth.uid())
    )
  );
