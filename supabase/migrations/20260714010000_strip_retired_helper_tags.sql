-- Strip RETIRED job tags off helper rows.
--
-- 'plumbing' and 'midnight-lift' were retired in the July 2026 liability
-- triage (trade work / unlicensed passenger carriage — see the note in
-- functions/_shared/householdPricing.ts). The categories were removed from
-- the bookable catalogue and the customer UI, but helpers who ticked them
-- under the old picker still CARRY the tags:
--   * their public profile + homepage card advertised "🚿 Plumbing" /
--     "🌙 Midnight Lift" — services Vano refuses to sell;
--   * a direct POST with the old category could still dispatch to them.
-- The frontends now also FILTER unknown tags at render time (HelperCards /
-- HelperPublicProfile), but the data should be clean, not just hidden.
--
-- array_remove is a no-op for rows without the tag, so this is idempotent.

update public.household_helpers
   set categories = array_remove(array_remove(categories, 'plumbing'), 'midnight-lift')
 where categories && array['plumbing', 'midnight-lift'];
