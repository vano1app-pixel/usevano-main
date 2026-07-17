-- Security hardening (owner-approved 2026-07-17) — closes three real holes
-- found by the advisor scan + a manual policy/grant audit. All app writes to
-- these tables verified beforehand: signups + profile edits + booking
-- lifecycle go through service-role edge functions except the exact
-- client-side writes listed below, which keep working.
--
-- HOLE 1 — anyone could insert a fake fully-verified helper row.
-- Leftover INSERT policies let anon (public API key) and any signed-in user
-- insert directly into household_helpers with arbitrary column values —
-- id_verified=true, status='approved', all three vano_verified flags — and
-- start receiving dispatches, bypassing the whole ID funnel. No app code
-- uses these paths (all signups go via create-helper-application).
drop policy if exists "anon_insert_household_helpers" on public.household_helpers;
drop policy if exists "helpers_insert_own_authenticated" on public.household_helpers;
drop policy if exists "anon_insert_helper_applications" on public.helper_applications;

-- HOLE 2 — a signed-in helper could self-award the blue tick.
-- authenticated held UPDATE on EVERY column of its own row (RLS gates rows,
-- not columns), so one PATCH could set id_verified / student_email_verified /
-- verified_plan_active. Narrow the grant to exactly what the app writes
-- client-side: dashboard toggles + profile sheet (StudentDashboard) and the
-- admin approve/reject flip (HouseholdAdmin — admins are role `authenticated`
-- too, so `status` must stay writable; a helper flipping their own status is
-- the accepted residual, it can't grant verification or the tick).
revoke update on table public.household_helpers from anon, authenticated;
grant update (is_available, autopilot_opt_in, bio, payment_handle,
              categories, availability, photo_url, status)
  on public.household_helpers to authenticated;

-- HOLE 3 — bookings could be forged and helpers could self-mark paid.
-- "Customers can create bookings" let anon insert bookings directly —
-- skipping server pricing, the safety screen and the unpaid-strike block,
-- and firing the dispatch trigger (real SMS to real helpers for fake jobs).
-- No client code inserts bookings; the ONE path is the checkout edge
-- function (service role, unaffected).
drop policy if exists "Customers can create bookings" on public.household_bookings;
-- And the assigned-helper UPDATE policy covered every column, so a helper
-- could set paid_at (skipping the fee gate), booking_data, price fields…
-- Client code writes exactly these six (claim / GPS stream / advance):
revoke update on table public.household_bookings from anon, authenticated;
grant update (status, student_id, accepted_at,
              worker_lat, worker_lng, worker_location_updated_at)
  on public.household_bookings to authenticated;

-- STORAGE — job-photos (customers' homes) were enumerable by anyone: the
-- SELECT policy enabled bucket LISTING via the storage API. Public-URL reads
-- (getPublicUrl — how the app serves them) bypass RLS on public buckets and
-- keep working; only enumeration dies. The anon upload policy for
-- helper-photos is unused (join photo uploads go via edge function) and let
-- anyone fill the 1 GB free-tier storage.
drop policy if exists "public_read_job_photos" on storage.objects;
drop policy if exists "anon_upload_helper_photos" on storage.objects;

-- DEAD MARKETPLACE RPCs — SECURITY DEFINER functions from the deleted
-- freelancer marketplace, still publicly executable. Nothing in src/ calls
-- them (the live frontend RPC set is get_household_booking,
-- get_household_chat, recent_household_activity, household_offer_count —
-- untouched, as are has_role and every trigger function). service_role keeps
-- EXECUTE so any cron/edge caller is unaffected — check_and_bump_rate_limit
-- in particular is service-role-called by edge functions and stays working.
do $$
declare fn text;
begin
  foreach fn in array array[
    'approve_community_listing_request(uuid)',
    'check_and_bump_rate_limit(text, text, integer, integer)',
    'claim_scouted_freelancer(uuid)',
    'expire_stale_hire_requests()',
    'freelancer_sales_stats(uuid)',
    'get_scouted_freelancer_by_token(uuid)',
    'public_recent_match_count()',
    'publish_community_listing(text, text, text, text, numeric, numeric, text)',
    'record_profile_view(uuid)',
    'reject_community_listing_request(uuid, text)',
    'submit_ai_find_feedback(uuid, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;

-- DEFENSE IN DEPTH — Supabase's default GRANT ALL includes TRUNCATE, which
-- RLS does NOT govern. PostgREST never exposes it, but there's no reason the
-- public API roles should hold it at all.
revoke truncate on all tables in schema public from anon, authenticated;
