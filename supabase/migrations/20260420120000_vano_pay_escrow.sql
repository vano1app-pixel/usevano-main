-- Vano Pay escrow: switch the money flow from instant destination
-- charges to Separate Charges and Transfers (SCT). The charge lands
-- on the platform Stripe account and sits there until the hirer
-- releases it (or a 14-day timer auto-releases to protect the
-- freelancer from a ghosting client). This migration only adds the
-- columns the new flow needs; the old state values keep their
-- meaning and the existing status enum stays untouched.
--
-- State machine under escrow:
--   awaiting_payment → paid (HELD)
--     ├─ hirer releases →  transferred (RELEASED)
--     ├─ auto-release fires at auto_release_at → transferred
--     ├─ hirer disputes (sets dispute_reason) → paid but frozen,
--     │                                          auto-release skips
--     ├─ admin refunds on dispute →            refunded
--     └─ Stripe refund webhook →               refunded
--
-- We keep 'paid' as the held state name (no enum change) so existing
-- code and indexes continue to work. The UI surfaces it as "held".
-- `transferred` keeps meaning "money is with the freelancer" — the
-- only change is WHEN it fires (now on release, not on checkout
-- completion).

ALTER TABLE public.vano_payments
  -- When auto-release should fire if the hirer hasn't acted.
  -- Populated by the webhook on paid-state transition; cleared when
  -- released/refunded. Null on rows from before this migration (they
  -- used the old destination-charge flow and went straight to
  -- 'transferred' anyway, so auto-release doesn't apply).
  ADD COLUMN IF NOT EXISTS auto_release_at timestamptz,
  -- Audit timestamps for the two terminal transitions.
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  -- Who triggered the release — 'hirer' | 'auto' | 'admin'. Optional
  -- but handy when a freelancer asks "why did my money land today?"
  ADD COLUMN IF NOT EXISTS released_by text
    CHECK (released_by IS NULL OR released_by IN ('hirer', 'auto', 'admin')),
  -- Dispute flag. Non-null → the hirer clicked "Flag a problem" and
  -- the auto-release cron will skip this row. Admin releases or
  -- refunds manually. For v1 the reason is free text; no separate
  -- enum state needed.
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  -- Stripe refund id when we've refunded this row. Null otherwise.
  ADD COLUMN IF NOT EXISTS stripe_refund_id text;

-- Index for the auto-release cron: finds held payments past their
-- window, still unreleased, not in dispute. Partial index keeps it
-- tiny even as the payments table grows — we only ever scan the
-- "due now" slice.
CREATE INDEX IF NOT EXISTS vano_payments_auto_release_due_idx
  ON public.vano_payments (auto_release_at)
  WHERE status = 'paid'
    AND auto_release_at IS NOT NULL
    AND dispute_reason IS NULL;

COMMENT ON COLUMN public.vano_payments.auto_release_at IS
  'When auto-release fires if the hirer has not manually released. Populated by stripe-webhook at the moment the row enters ''paid'' (held) state. Cleared on release/refund. NULL means no auto-release (pre-escrow rows, or post-terminal).';
COMMENT ON COLUMN public.vano_payments.released_by IS
  'Who triggered the release: hirer (manual Release button), auto (14-day cron), admin (post-dispute release). Null until released.';
COMMENT ON COLUMN public.vano_payments.dispute_reason IS
  'Hirer-entered reason for flagging a problem. Non-null pauses the auto-release cron until an admin resolves.';
COMMENT ON COLUMN public.vano_payments.stripe_refund_id IS
  'Stripe refund id when this row has been refunded to the hirer. Null for released or never-refunded rows.';
