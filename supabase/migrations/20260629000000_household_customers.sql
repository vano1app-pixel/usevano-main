-- Card-on-file for households (the "Uber" invisible-payment foundation).
--
-- When a household first pays for a booking, Stripe Checkout saves their card
-- to a Stripe customer (notify-household-accepted sets customer_creation +
-- setup_future_usage). This table maps the household's PHONE (their identity —
-- households never sign up) to that Stripe customer id, so a later booking can
-- be charged off-session with no pay step.
--
-- Service-role only: RLS is enabled with NO policies, so the anon/auth client
-- can never read or write it; only the edge functions (service role) touch it.

create table if not exists public.household_customers (
  phone                  text primary key,
  stripe_customer_id     text not null,
  default_payment_method text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.household_customers enable row level security;

comment on table public.household_customers is
  'Phone → Stripe customer id, for off-session "card on file" charges. Service-role only.';
