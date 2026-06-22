-- Auto-fire the Autopilot matcher when a new plan subscription is created,
-- without touching the (large) Stripe webhook. A pg_net trigger POSTs the new
-- plan id to dispatch-autopilot-plan. That function is internal-only; since a
-- DB trigger can't hold the service-role key, it authenticates with a random
-- shared secret stored here in private_config — generated at migration time, so
-- the secret never appears in source control.

create table if not exists private_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table private_config enable row level security;  -- no policy: service-role only

insert into private_config (key, value)
  values ('autopilot_dispatch_secret',
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;

create or replace function trg_autopilot_dispatch() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  secret text;
begin
  select value into secret from private_config where key = 'autopilot_dispatch_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url     := 'https://puomfwjtpvqedwxjxogh.supabase.co/functions/v1/dispatch-autopilot-plan',
    body    := jsonb_build_object('plan_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', secret)
  );
  return new;
end;
$$;

-- Only the ongoing "House Autopilot" plan auto-matches a regular helper.
drop trigger if exists autopilot_dispatch_on_new_plan on household_plan_subscriptions;
create trigger autopilot_dispatch_on_new_plan
  after insert on household_plan_subscriptions
  for each row
  when (new.plan = 'autopilot')
  execute function trg_autopilot_dispatch();
