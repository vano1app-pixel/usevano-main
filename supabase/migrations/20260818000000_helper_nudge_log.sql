-- The helper-copilot's memory — what the supply agent has already said, to whom.
-- ---------------------------------------------------------------------------
-- helper-copilot (?action=nudge) is the first function in this codebase that
-- lets a MODEL choose the words going out over Twilio. The rules in
-- _shared/helperFunnel.ts decide WHO is contacted and WHY (deterministic,
-- unit-tested); Gemini only rewrites the sentence. This table is the third
-- guard: a per-helper, per-signal counter and clock, so the same student can
-- never be told twice in a day to add a photo — no matter how often the cron
-- runs, how many rules they trip, or what the model would like to say.
--
-- Shaped like every other idempotency stamp in the fleet (one row per
-- (helper, signal), incremented AFTER a successful send), just generalised
-- out of the per-column stamps nudge-helper-onboarding uses — new signals
-- shouldn't each need a migration.
--
-- Service-role only: RLS on with NO policies, matching helper_sos_events and
-- household_customer_ratings. Nothing here is customer- or helper-readable.

create table if not exists public.helper_nudge_log (
  id            uuid primary key default gen_random_uuid(),
  helper_id     uuid not null references public.household_helpers(id) on delete cascade,
  -- The FunnelSignal.kind that fired ('id_unstarted', 'no_photo'…). Renaming a
  -- kind in helperFunnel.ts resets its history, which is why the module calls
  -- these keys a stored contract.
  kind          text not null,
  sends         integer not null default 0,
  last_sent_at  timestamptz,
  -- Audit trail: what actually went out, and whether a model wrote it. Keeps
  -- "what did we text this person?" answerable without reading Twilio logs.
  last_channel  text,
  last_message  text,
  last_ai       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint helper_nudge_log_unique unique (helper_id, kind)
);

-- The agent's hot path: "everything already said to these helpers".
create index if not exists helper_nudge_log_helper_idx
  on public.helper_nudge_log (helper_id);

alter table public.helper_nudge_log enable row level security;
revoke all on public.helper_nudge_log from anon, authenticated;
