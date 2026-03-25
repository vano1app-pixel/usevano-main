-- Banner cover, service area, and typical fixed-price project range for freelancer profiles
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS service_area text,
  ADD COLUMN IF NOT EXISTS typical_budget_min integer,
  ADD COLUMN IF NOT EXISTS typical_budget_max integer;

COMMENT ON COLUMN public.student_profiles.banner_url IS 'Wide cover image URL (storage public URL)';
COMMENT ON COLUMN public.student_profiles.service_area IS 'Where they work from / travel e.g. Galway city, Remote';
COMMENT ON COLUMN public.student_profiles.typical_budget_min IS 'Typical fixed-price project budget lower bound (EUR whole euros)';
COMMENT ON COLUMN public.student_profiles.typical_budget_max IS 'Typical fixed-price project budget upper bound (EUR whole euros)';
