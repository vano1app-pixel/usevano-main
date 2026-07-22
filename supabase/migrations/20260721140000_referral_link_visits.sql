-- Link-open tracking for the partner referral programme.
-- ---------------------------------------------------------------------------
-- The tracker showed signups + earnings but NOT the top of the funnel — how
-- many people actually opened a partner's /join?ref=CODE link. That's the
-- number that makes sharing feel worth it ("40 opened → 6 joined → €12"), so
-- we count DISTINCT devices that opened each code's link.
--
-- One row per (code, device): the visitor_key is a random per-device id the
-- client keeps in localStorage (NOT PII), and the unique constraint means a
-- refresh or a second visit never re-counts — the number reads as "people",
-- not "page loads". Written service-role-only by track-referral-open, counted
-- by partner-program; RLS on with no public policy, like every referral table.
create table if not exists public.referral_code_visits (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references public.referral_codes(id) on delete cascade,
  visitor_key text not null,
  created_at  timestamptz not null default now(),
  unique (code_id, visitor_key)
);
create index if not exists referral_code_visits_code_idx on public.referral_code_visits (code_id);

alter table public.referral_code_visits enable row level security;
