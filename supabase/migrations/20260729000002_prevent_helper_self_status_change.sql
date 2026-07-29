-- Security hardening (2026-07-29) — stop a helper from self-unsuspending.
--
-- FINDING: 20260717010000 grants UPDATE(status) to `authenticated` (it had to —
-- column grants are role-wide and admins are `authenticated` too, so the
-- HouseholdAdmin approve/suspend flow needs `status` writable). Combined with
-- the RLS policy helpers_update_own_availability (auth.uid() = user_id), a helper
-- suspended by an admin could PATCH status='approved' on their own row and
-- re-enter dispatch (id_verified is untouched) — ban evasion in a marketplace
-- that sends strangers into people's homes. The 20260717010000 comment logged
-- this as the "accepted residual"; this migration closes it without changing the
-- admin write path or the column grant.
--
-- FIX: a BEFORE UPDATE trigger that rejects a status change made by the row's
-- OWN non-admin owner. Untouched:
--   * Admin approve/suspend — has_role(admin) passes (and admins usually act on
--     rows they don't own anyway).
--   * Service-role edge writes (create-helper-application etc.) — auth.uid() is
--     NULL under the service role, so the guard is skipped.
--   * Ordinary helper self-edits (is_available, bio, categories, …) — they never
--     touch `status`, so the trigger doesn't even fire (BEFORE UPDATE OF status).

create or replace function public.prevent_helper_self_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.status is distinct from OLD.status
     and auth.uid() is not null
     and auth.uid() = OLD.user_id
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'helpers may not change their own status';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.prevent_helper_self_status_change() from public, anon, authenticated;

drop trigger if exists trg_prevent_helper_self_status_change on public.household_helpers;
create trigger trg_prevent_helper_self_status_change
  before update of status on public.household_helpers
  for each row execute function public.prevent_helper_self_status_change();
