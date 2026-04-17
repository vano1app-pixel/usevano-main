-- Give `profiles` a dedicated `phone` column so business onboarding can stop
-- overloading `work_description` (a legitimate business-bio field) as a
-- phone stash. Students keep storing phone on `student_profiles`.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- One-shot backfill: move numeric-looking strings from work_description into
-- phone for businesses only, wipe the stash, and leave legitimate free-text
-- descriptions alone. Regex matches only when the string is essentially a
-- phone number (digits, spaces, dashes, parens, leading +, 6-24 chars).
UPDATE public.profiles
SET phone = btrim(work_description),
    work_description = NULL
WHERE user_type = 'business'
  AND work_description IS NOT NULL
  AND btrim(work_description) ~ '^\+?[0-9 ()\-]{6,24}$'
  AND (phone IS NULL OR phone = '');
