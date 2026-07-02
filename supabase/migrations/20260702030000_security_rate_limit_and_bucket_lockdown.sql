-- Applied to production 2026-07-02.
-- Shared, DB-backed rate limiter for the unauthenticated phone/referral lookup
-- endpoints, so an attacker can't cheaply enumerate the Irish mobile space to
-- harvest helper PII / customer booking ids / referral balances.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (bucket, key, created_at);

alter table public.rate_limit_events enable row level security;
-- No policies → no anon/authenticated access; only the service role (edge
-- functions) and the SECURITY DEFINER function below can touch it.

create or replace function public.check_and_bump_rate_limit(
  p_bucket text, p_key text, p_max int, p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  delete from public.rate_limit_events
   where bucket = p_bucket and key = p_key
     and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into v_count
    from public.rate_limit_events
   where bucket = p_bucket and key = p_key;

  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limit_events (bucket, key) values (p_bucket, p_key);
  return true;
end;
$$;

revoke all on function public.check_and_bump_rate_limit(text, text, int, int) from public;
grant execute on function public.check_and_bump_rate_limit(text, text, int, int) to service_role;

-- Bucket lockdown: the helper-photos bucket is public, so individual photo
-- URLs resolve via the public CDN path without this policy. The broad SELECT
-- policy additionally allowed LISTING every object in the bucket (enumeration).
-- Drop it — photos still display via their public URLs.
drop policy if exists "public_read_helper_photos" on storage.objects;
