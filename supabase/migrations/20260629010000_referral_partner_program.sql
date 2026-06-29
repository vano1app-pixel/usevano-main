-- Referral / partner program
-- ---------------------------------------------------------------------------
-- A code-based channel program. A "partner" (e.g. a student union) or an
-- existing helper gets a code to recruit students. When a recruited helper
-- completes a paid job, the partner earns a commission (default 5% of the job
-- value) — carved out of VANO's platform cut, NOT the helper's earnings, so the
-- minimum-wage invariant is untouched.
--
-- Accrual is done by a trigger on household_payouts so the live payout edge
-- function (capture-household-payment) is never modified. Both triggers are
-- exception-safe: a failure here can NEVER block a payout or a signup.

-- Codes owned by a partner/recruiter. Keyed loosely by email (households/unions
-- have no login). Codes are not secrets — they only let someone credit the owner.
create table if not exists public.referral_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  owner_name     text,
  owner_email    text,
  owner_phone    text,
  kind           text not null default 'partner',   -- 'partner' | 'peer'
  commission_bps integer not null default 500,       -- 5% of job value
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists referral_codes_owner_email_idx on public.referral_codes (lower(owner_email));

-- Lifetime attribution: which helper signed up under which code (one per helper).
create table if not exists public.referral_attributions (
  id         uuid primary key default gen_random_uuid(),
  code_id    uuid not null references public.referral_codes(id) on delete cascade,
  helper_id  uuid not null references public.household_helpers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (helper_id)
);

-- Accrued commission per completed job (one row per payout).
create table if not exists public.referral_commissions (
  id           uuid primary key default gen_random_uuid(),
  code_id      uuid not null references public.referral_codes(id) on delete cascade,
  helper_id    uuid references public.household_helpers(id) on delete set null,
  booking_id   uuid,
  payout_id    uuid unique,
  job_cents    integer not null,
  amount_cents integer not null,
  status       text not null default 'pending',      -- 'pending' | 'paid'
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists referral_commissions_code_idx on public.referral_commissions (code_id);

-- The raw code a helper entered at signup, resolved to an attribution by trigger.
alter table public.household_helpers add column if not exists referred_by_code text;

-- RLS on, no public policies → reachable only via the service role (edge fns).
alter table public.referral_codes        enable row level security;
alter table public.referral_attributions enable row level security;
alter table public.referral_commissions  enable row level security;

-- ── Resolve a helper's typed code into an attribution ──────────────────────
create or replace function public.resolve_referral_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_id uuid;
begin
  begin
    if NEW.referred_by_code is null or btrim(NEW.referred_by_code) = '' then
      return NEW;
    end if;
    if exists (select 1 from referral_attributions where helper_id = NEW.id) then
      return NEW;
    end if;
    select id into v_code_id
      from referral_codes
      where upper(code) = upper(btrim(NEW.referred_by_code)) and active
      limit 1;
    if v_code_id is null then
      return NEW;
    end if;
    insert into referral_attributions (code_id, helper_id)
      values (v_code_id, NEW.id)
      on conflict (helper_id) do nothing;
  exception when others then
    raise warning 'resolve_referral_attribution failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_resolve_referral_attribution on public.household_helpers;
create trigger trg_resolve_referral_attribution
  after insert or update of referred_by_code on public.household_helpers
  for each row execute function public.resolve_referral_attribution();

-- ── Accrue commission when a payout is written ─────────────────────────────
-- household_payouts.student_id is the helper's auth user_id (see
-- capture-household-payment), so we resolve the helper row via user_id.
create or replace function public.accrue_referral_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_helper_id uuid;
  v_code      referral_codes%rowtype;
  v_attr      referral_attributions%rowtype;
  v_job       integer;
  v_amt       integer;
begin
  begin
    select id into v_helper_id from household_helpers where user_id = NEW.student_id limit 1;
    if v_helper_id is null then return NEW; end if;

    select * into v_attr from referral_attributions where helper_id = v_helper_id;
    if not found then return NEW; end if;

    select * into v_code from referral_codes where id = v_attr.code_id;
    if not found or not v_code.active then return NEW; end if;

    select coalesce(price_estimate_cents, 0) into v_job
      from household_bookings where id = NEW.booking_id;
    if v_job is null or v_job <= 0 then return NEW; end if;

    v_amt := floor(v_job * v_code.commission_bps / 10000.0);
    if v_amt <= 0 then return NEW; end if;

    insert into referral_commissions (code_id, helper_id, booking_id, payout_id, job_cents, amount_cents)
      values (v_code.id, v_helper_id, NEW.booking_id, NEW.id, v_job, v_amt)
      on conflict (payout_id) do nothing;
  exception when others then
    -- A commission accrual problem must NEVER block a helper's payout.
    raise warning 'accrue_referral_commission failed: %', sqlerrm;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_accrue_referral_commission on public.household_payouts;
create trigger trg_accrue_referral_commission
  after insert on public.household_payouts
  for each row execute function public.accrue_referral_commission();
