-- Address Supabase security advisor findings surfaced during backend audit:
--   1. student_achievements INSERT policy was WITH CHECK (true) — auth'd
--      users could write arbitrary badge rows. Scope the check to self so
--      the service-role path (check-achievements edge fn) still works
--      (service role bypasses RLS) but client-side inserts are pinned
--      to the caller's own user_id.
--   2. public.set_updated_at had a mutable search_path. Pin it so future
--      schema-path shenanigans can't redirect the function to a
--      malicious table.
--   3. Seven public storage buckets had broad "Anyone can view X" SELECT
--      policies on storage.objects. Public buckets serve object URLs via
--      the public endpoint regardless of this policy — the only thing it
--      enabled was LIST calls, letting anyone enumerate every uploaded
--      file. Drop the broad SELECTs; collapse the three duplicates on
--      event-images.

-- 1. student_achievements: scope INSERT WITH CHECK to self.
drop policy if exists "System can insert achievements" on public.student_achievements;

create policy "Users can insert own achievements"
  on public.student_achievements
  for insert
  with check (auth.uid() = user_id);

-- 2. set_updated_at: pin search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 3. Drop broad public-bucket SELECT policies. Public buckets stay
--    readable via https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
--    — that endpoint serves public objects without consulting
--    storage.objects RLS. The policies below only governed LIST and
--    signed-URL generation, which no client code relies on.
drop policy if exists "Public read access for avatars" on storage.objects;
drop policy if exists "Anyone can view chat images" on storage.objects;
drop policy if exists "Anyone can view community images" on storage.objects;
drop policy if exists "Email assets are publicly accessible" on storage.objects;
drop policy if exists "Anyone can view event images" on storage.objects;
drop policy if exists "Event images are publicly accessible" on storage.objects;
drop policy if exists "Event images public read" on storage.objects;
drop policy if exists "Anyone can view portfolio images" on storage.objects;
drop policy if exists "Anyone can view review photos" on storage.objects;
