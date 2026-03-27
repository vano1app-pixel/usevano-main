-- Ensure columns exist on remote DBs created before the full schema (fixes PostgREST 400 on insert).
ALTER TABLE public.community_listing_requests
  ADD COLUMN IF NOT EXISTS applicant_email text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS rate_min numeric,
  ADD COLUMN IF NOT EXISTS rate_max numeric,
  ADD COLUMN IF NOT EXISTS rate_unit text;

-- Backfill NOT NULL where legacy rows may have NULLs (safe if already constrained).
UPDATE public.community_listing_requests
SET description = COALESCE(NULLIF(trim(description), ''), '')
WHERE description IS NULL;

UPDATE public.community_listing_requests
SET title = COALESCE(NULLIF(trim(title), ''), '(untitled)')
WHERE title IS NULL;

UPDATE public.community_listing_requests
SET category = COALESCE(NULLIF(trim(category), ''), 'other')
WHERE category IS NULL;

ALTER TABLE public.community_listing_requests
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN description SET NOT NULL;
