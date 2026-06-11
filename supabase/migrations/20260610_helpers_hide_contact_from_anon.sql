-- Helpers' phone numbers and emails were readable by anyone with the anon
-- key (the "Public can read non-suspended helpers" policy exposes all
-- columns). Replace the table-level anon SELECT grant with a column list
-- that excludes contact details.
--
-- Phone-gated flows (/helper/profile, /student-account) now look helpers up
-- via the find-helper-by-phone edge function (service role), so nothing on
-- the site needs anon access to these columns.
--
-- authenticated / service_role grants are untouched: helpers still read
-- their own row, admins still see contact info.

REVOKE SELECT ON public.household_helpers FROM anon;

GRANT SELECT (
  id,
  created_at,
  name,
  photo_url,
  city,
  areas_served,
  status,
  is_available,
  accepted_count,
  rating_avg,
  user_id,
  categories,
  tutor_subjects,
  tutor_levels,
  age,
  bio,
  availability,
  average_rating,
  rating_count
) ON public.household_helpers TO anon;
