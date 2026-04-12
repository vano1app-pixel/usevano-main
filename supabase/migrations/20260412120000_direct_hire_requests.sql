-- Extend hire_requests to support direct hire flow ("Hire now" button on freelancer profiles/cards).
-- The existing table supports the "Let Vano Handle It" concierge flow (kind='concierge').
-- Direct hires (kind='direct') target a specific freelancer and auto-expire after a countdown (default 2h).

-- 1. Add columns
alter table public.hire_requests
  add column if not exists kind text not null default 'concierge',
  add column if not exists expires_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists target_freelancer_id uuid references auth.users(id) on delete set null;

-- Back-fill target_freelancer_id for direct requests from matched_freelancer_id, but for new
-- direct inserts we use target_freelancer_id as the upfront target. matched_freelancer_id
-- retains its role for concierge (set by the VANO team after matching).

-- 2. Constrain kind values
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'hire_requests_kind_check'
  ) then
    alter table public.hire_requests
      add constraint hire_requests_kind_check check (kind in ('concierge','direct'));
  end if;
end $$;

-- 3. Direct requests must set a target freelancer and an expiry
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'hire_requests_direct_required_check'
  ) then
    alter table public.hire_requests
      add constraint hire_requests_direct_required_check
      check (
        kind <> 'direct'
        or (target_freelancer_id is not null and expires_at is not null)
      );
  end if;
end $$;

-- 4. Useful indexes
create index if not exists idx_hire_requests_target_freelancer
  on public.hire_requests(target_freelancer_id)
  where kind = 'direct';

create index if not exists idx_hire_requests_pending_expiring
  on public.hire_requests(expires_at)
  where kind = 'direct' and status = 'pending';

-- 5. RLS — allow the targeted freelancer to view their direct requests
drop policy if exists "Targeted freelancer can view direct hire requests" on public.hire_requests;
create policy "Targeted freelancer can view direct hire requests"
  on public.hire_requests for select
  using (kind = 'direct' and auth.uid() = target_freelancer_id);

-- 6. RLS — allow the targeted freelancer to update status (accept/decline only)
drop policy if exists "Targeted freelancer can respond to direct hire requests" on public.hire_requests;
create policy "Targeted freelancer can respond to direct hire requests"
  on public.hire_requests for update
  using (kind = 'direct' and auth.uid() = target_freelancer_id and status = 'pending')
  with check (
    kind = 'direct'
    and auth.uid() = target_freelancer_id
    and status in ('accepted','declined')
  );

-- 7. Updated_at trigger (reuse if exists, otherwise create)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists hire_requests_set_updated_at on public.hire_requests;
create trigger hire_requests_set_updated_at
  before update on public.hire_requests
  for each row execute function public.set_updated_at();

-- 8. Helper function to expire stale pending direct hire requests.
-- Returns the number of rows expired. Can be invoked from an Edge Function / cron.
create or replace function public.expire_stale_hire_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n_expired integer;
begin
  with expired as (
    update public.hire_requests
    set status = 'expired', responded_at = now()
    where kind = 'direct'
      and status = 'pending'
      and expires_at is not null
      and expires_at < now()
    returning id, requester_id, target_freelancer_id
  )
  select count(*) into n_expired from expired;

  return coalesce(n_expired, 0);
end $$;

grant execute on function public.expire_stale_hire_requests() to anon, authenticated, service_role;
