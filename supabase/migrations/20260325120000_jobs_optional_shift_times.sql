-- One-time / fixed-budget gigs: deadline only, no shift start/end
ALTER TABLE public.jobs
  ALTER COLUMN shift_start DROP NOT NULL,
  ALTER COLUMN shift_end DROP NOT NULL;
