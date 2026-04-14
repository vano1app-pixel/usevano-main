-- Digital sales reps pick their own expected bonus on top of the €10/hr retainer.
-- Stored as a numeric amount + a unit so the public profile can render "10% of
-- closed deals" vs "€50 per signed client" without lossy string parsing.

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS expected_bonus_amount NUMERIC(10, 2)
    CHECK (expected_bonus_amount IS NULL OR expected_bonus_amount >= 0);

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS expected_bonus_unit TEXT
    CHECK (expected_bonus_unit IS NULL OR expected_bonus_unit IN ('percentage', 'flat'));

COMMENT ON COLUMN public.student_profiles.expected_bonus_amount IS
  'Rep''s self-declared expected bonus per closed deal/client (digital_sales only).';
COMMENT ON COLUMN public.student_profiles.expected_bonus_unit IS
  '"percentage" = % of deal value, "flat" = € per client. NULL when no bonus declared.';
