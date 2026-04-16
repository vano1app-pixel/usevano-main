-- Ireland-scale location model for freelancers.
--
-- We replace the free-text `student_profiles.service_area` field (in
-- day-to-day use but unstructured — impossible to filter or match on)
-- with a structured pair: `county` (one of the 26 Republic of Ireland
-- counties, nullable) and `remote_ok` (whether they accept jobs from
-- outside their county).
--
-- `service_area` stays in the table for now as a display fallback and
-- audit trail. A follow-up migration can drop it once all readers are
-- off it in production.
--
-- New freelancers fill in `county` + `remote_ok` via the wizard (county
-- asked only when the chosen category is local; remote_ok auto-true
-- for digital categories). Existing rows are back-filled here by a
-- case-insensitive text match against `service_area`, and videography
-- freelancers are flipped to `remote_ok = false` (their trade is
-- inherently local).

-- ───────────── Schema changes ─────────────

alter table public.student_profiles
  add column if not exists county text,
  add column if not exists remote_ok boolean not null default true;

-- ───────────── Back-fill ─────────────

-- Pull a county out of the legacy free-text `service_area` when it
-- mentions one of the 26 Republic counties. We only fill rows where
-- `county` is still null so this migration is safely re-runnable.
update public.student_profiles sp
   set county = c.name
  from (
    values
      ('Carlow'),('Cavan'),('Clare'),('Cork'),('Donegal'),
      ('Dublin'),('Galway'),('Kerry'),('Kildare'),('Kilkenny'),
      ('Laois'),('Leitrim'),('Limerick'),('Longford'),('Louth'),
      ('Mayo'),('Meath'),('Monaghan'),('Offaly'),('Roscommon'),
      ('Sligo'),('Tipperary'),('Waterford'),('Westmeath'),
      ('Wexford'),('Wicklow')
  ) as c(name)
 where sp.county is null
   and sp.service_area ilike '%' || c.name || '%';

-- Videography is the only "local" community category — those
-- freelancers have to show up in person, so we clear their auto-default
-- `remote_ok = true`. Digital categories (websites / digital_sales /
-- social_media) keep the default.
update public.student_profiles sp
   set remote_ok = false
  from public.community_posts cp
 where cp.user_id = sp.user_id
   and cp.category = 'videography';

-- ───────────── Indexes ─────────────

create index if not exists idx_student_profiles_county
  on public.student_profiles (county);

-- Partial index: the remote-only query path is "show me everyone who
-- accepts remote work" (for digital-category matching). Indexing only
-- true rows keeps the index small and hot.
create index if not exists idx_student_profiles_remote_ok
  on public.student_profiles (remote_ok) where remote_ok = true;

comment on column public.student_profiles.county is
  'One of the 26 Republic of Ireland counties. Nullable: digital-only freelancers can leave this empty and rely on `remote_ok = true` instead.';
comment on column public.student_profiles.remote_ok is
  'True if the freelancer accepts work from outside their county. Auto-true for digital categories (websites / digital_sales / social_media); videography freelancers default to false and can opt in.';
