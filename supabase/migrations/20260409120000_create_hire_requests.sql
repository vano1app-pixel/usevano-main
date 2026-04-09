-- Hire requests: tracks "Let Vano Handle It" concierge requests
create table public.hire_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users(id) on delete cascade not null,
  description text not null,
  category text,
  budget_range text,
  timeline text,
  status text not null default 'pending',
  matched_freelancer_id uuid references auth.users(id) on delete set null,
  custom_price numeric,
  team_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hire_requests enable row level security;

-- Requester can read their own requests
create policy "Users can view own hire requests"
  on public.hire_requests for select
  using (auth.uid() = requester_id);

-- Requester can insert their own requests
create policy "Users can create hire requests"
  on public.hire_requests for insert
  with check (auth.uid() = requester_id);

-- Admins (via service role) can do everything – handled by service_role bypass
