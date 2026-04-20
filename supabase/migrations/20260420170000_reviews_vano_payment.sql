-- Allow reviews to be tied to a released Vano Pay payment instead of
-- a jobs row. Without this, the "leave a review" nudge on a released
-- Vano Pay receipt would silently fail the INSERT RLS (which requires
-- a matching jobs row — Vano Pay flows don't create one). This unlocks
-- the feedback loop that feeds the Vano Match ranker's review signal.
--
-- Shape: either job_id OR vano_payment_id must be set (never both
-- NULL, never both populated). Enforced via CHECK so both the legacy
-- jobs-backed reviews and the new Vano-Pay-backed reviews coexist
-- without schema branching downstream.

-- 1. Drop NOT NULL so we can accept vano-payment-scoped reviews.
ALTER TABLE public.reviews
  ALTER COLUMN job_id DROP NOT NULL;

-- 2. New FK to vano_payments — nullable. ON DELETE SET NULL so a
-- payment deletion doesn't cascade-nuke a standing review; the
-- review keeps the rating/comment but loses its pointer back.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS vano_payment_id uuid REFERENCES public.vano_payments(id) ON DELETE SET NULL;

-- 3. Exactly-one source constraint.
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_source_exactly_one;
ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_source_exactly_one
  CHECK (
    (job_id IS NOT NULL AND vano_payment_id IS NULL)
    OR (job_id IS NULL AND vano_payment_id IS NOT NULL)
  );

-- 4. Reviewer dedupe — one review per reviewer per Vano Pay row.
-- The existing UNIQUE(job_id, reviewer_id) covers the jobs side
-- but ignored NULL job_id rows, so Vano-Pay reviews need their own
-- partial UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_vano_payment_reviewer_uidx
  ON public.reviews (vano_payment_id, reviewer_id)
  WHERE vano_payment_id IS NOT NULL;

-- 5. Expand the INSERT policy — it gated on jobs-only before, so an
-- INSERT with vano_payment_id would fail RLS. New policy accepts
-- EITHER a legitimate job relationship OR a transferred Vano Pay
-- payment where the caller is the hirer and the reviewee is the
-- freelancer (reviewee-as-hirer would be a freelancer-rates-hirer
-- path we don't need yet).
DROP POLICY IF EXISTS "Users can only review after working together" ON public.reviews;

CREATE POLICY "Users can only review after working together"
ON public.reviews FOR INSERT
WITH CHECK (
  auth.uid() = reviewer_id
  AND reviewer_id != reviewee_id
  AND (
    -- Legacy jobs-based review (unchanged conditions).
    (job_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = reviews.job_id
        AND j.shift_date < CURRENT_DATE
        AND (
          (j.posted_by = reviewer_id AND EXISTS (
            SELECT 1 FROM public.job_applications
            WHERE job_id = j.id AND student_id = reviewee_id AND status = 'accepted'
          ))
          OR
          (j.posted_by = reviewee_id AND EXISTS (
            SELECT 1 FROM public.job_applications
            WHERE job_id = j.id AND student_id = reviewer_id AND status = 'accepted'
          ))
        )
    ))
    OR
    -- New: Vano-Pay-based review. Only the hirer on a TRANSFERRED
    -- payment can review the freelancer who received it. Status
    -- check ensures money actually moved; refunded / held rows
    -- can't produce reviews.
    (vano_payment_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vano_payments vp
      WHERE vp.id = reviews.vano_payment_id
        AND vp.business_id = reviewer_id
        AND vp.freelancer_id = reviewee_id
        AND vp.status = 'transferred'
    ))
  )
);

COMMENT ON COLUMN public.reviews.vano_payment_id IS
  'When set, this review is tied to a released Vano Pay payment instead of a jobs row. Feeds the Vano Match ranker''s review signal (avg_rating × log(count+1) at 20% weight).';
