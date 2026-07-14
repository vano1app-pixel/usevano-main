-- Before/after job photos — the evidence layer AND the share loop.
--
-- The helper snaps a photo on arrival ("before") and at finish ("after"),
-- uploaded through the job-photo edge function (service role; the function
-- verifies the caller is the assigned helper). They serve two jobs at once:
--   1. EVIDENCE — Vano Cover (€250 damage guarantee) claims and
--      report-a-problem disputes get before/after state instead of
--      word-against-word.
--   2. GROWTH — TrackBooking renders the pair as a shareable before/after
--      card with the customer's referral link attached.
--
-- Columns live on the booking row (one photo each, retakes overwrite) so the
-- anonymous customer's SECURITY-DEFINER RPC (get_household_booking) returns
-- them with no signature change, and the helper's explicit-column select can
-- add them under the existing table-level SELECT grant. Nothing secret here —
-- unlike arrival_code these are meant for both sides.

alter table public.household_bookings
  add column if not exists arrival_photo_url text,
  add column if not exists finish_photo_url  text;

comment on column public.household_bookings.arrival_photo_url is
  'Helper''s "before" photo of the work area, taken at arrival. Written only by the job-photo edge function (service role).';
comment on column public.household_bookings.finish_photo_url is
  'Helper''s "after" photo, taken when they mark the job finished. Written only by the job-photo edge function (service role).';

-- Public-read bucket, service-role writes only (no INSERT policy on purpose —
-- uploads go through the job-photo function, which checks the caller is the
-- assigned helper). Paths are job-photos/<booking uuid>/<arrival|finish>.jpg:
-- unguessable because the booking UUID is the capability, same trust model as
-- the tracking page.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  true,
  8388608, -- 8 MB — client resizes to ~1600px JPEG before upload
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Public reads so the photo URLs resolve on the anonymous tracking page.
drop policy if exists "public_read_job_photos" on storage.objects;
create policy "public_read_job_photos"
  on storage.objects for select to public
  using (bucket_id = 'job-photos');
