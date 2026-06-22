-- "Helpers sign up for House Autopilot" + auto-matching.
--
-- autopilot_opt_in: a helper has said they'll take regular (weekly/monthly)
-- Autopilot clients. Set at signup or toggled from their dashboard.
alter table household_helpers
  add column if not exists autopilot_opt_in boolean not null default false;

-- A subscription's assigned regular helper (the "same friendly face").
alter table household_plan_subscriptions
  add column if not exists assigned_helper_id uuid references household_helpers(id),
  add column if not exists assigned_at timestamptz,
  -- The Autopilot service config string (from Stripe metadata) so the offer
  -- can show the helper what's involved before they claim it.
  add column if not exists config text;

-- One offer row per (plan, helper) so re-dispatch is idempotent and we can
-- expire stale offers — mirrors household_job_offers for one-off jobs.
create table if not exists autopilot_plan_offers (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references household_plan_subscriptions(id) on delete cascade,
  helper_id   uuid not null references household_helpers(id) on delete cascade,
  status      text not null default 'pending',
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (plan_id, helper_id)
);

-- Edge functions use the service-role key (bypasses RLS). Enable RLS with no
-- policy so anon/authenticated can't read or write the offer table directly.
alter table autopilot_plan_offers enable row level security;
