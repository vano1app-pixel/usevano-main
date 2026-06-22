-- Curate the homepage "Meet the helpers" rail without removing a helper from
-- the platform. show_on_homepage = false hides them from the public cards while
-- they stay approved, dispatchable and present on every other surface (their
-- profile, the tracking helper chip, job offers). Defaults true so all current
-- helpers keep showing.
alter table household_helpers
  add column if not exists show_on_homepage boolean not null default true;

-- HelperCards reads this as the anonymous visitor, so anon needs column-level
-- SELECT (mirrors the id_verified grant) or the whole query is rejected.
grant select (show_on_homepage) on public.household_helpers to anon;
