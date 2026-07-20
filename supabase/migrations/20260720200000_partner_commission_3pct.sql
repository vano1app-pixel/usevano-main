-- Partner commission 5% → 3% (owner call, 2026-07-20).
-- ---------------------------------------------------------------------------
-- At 5% of job value a standard €36 clean left VANO netting €3.60 of its
-- €5.40 fee — under the owner's €4-per-job floor. At 3% the same job nets
-- €4.32. (Small flat jobs on the €4 minimum fee still net slightly under €4
-- when any commission is paid — a known, owner-accepted edge for now.)
--
-- The accrual triggers read commission_bps per code at run time, so changing
-- the default + existing rows is the whole change; no trigger edits needed.

alter table public.referral_codes alter column commission_bps set default 300;

-- Retroactive to existing codes: the programme was only promoted today and
-- no commissions have accrued yet, so no partner's earned money is touched.
update public.referral_codes set commission_bps = 300 where commission_bps = 500;
