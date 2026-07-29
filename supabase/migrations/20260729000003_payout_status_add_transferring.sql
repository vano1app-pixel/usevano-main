-- Bug fix (2026-07-29) — the release cron's claim status was never allowed by
-- the CHECK constraint, so it silently skipped every payout.
--
-- release-household-payouts claims a payout for transfer by flipping it to
-- 'transferring' (the dispute-race guard, index.ts:219): UPDATE ... SET
-- status='transferring' WHERE status='pending'. But the household_payouts
-- status CHECK (last set in 20260706020000) only permits
-- ('pending','released','transferred','failed','reversed') — 'transferring'
-- was never added. The Supabase client returns {error} (not a throw) on the
-- 23514 violation, and the code reads only `data` (`const { data: claimed }`),
-- so `claimed` is null and the row is treated as "taken by another run" and
-- SKIPPED. Net effect: no payout ever transfers through this cron — every
-- legacy-escrow helper payout is silently stuck 'pending'. It went unnoticed
-- because direct-pay (July 2026) made new payout rows rare.
--
-- Fix: allow 'transferring' (and keep every status the code actually writes:
-- pending, transferring, transferred, failed, reversed; plus legacy 'released').

alter table public.household_payouts drop constraint if exists household_payouts_status_check;
alter table public.household_payouts
  add constraint household_payouts_status_check
  check (status in ('pending','transferring','released','transferred','failed','reversed'));
