-- Free-tier housekeeping (owner-approved 2026-07-17):
--
-- 1) analytics_events retention — the table is WRITE-ONLY in app code
--    (src/lib/track.ts inserts; nothing reads it back — PostHog holds the
--    long-term copy). Without a cap it is the fastest-growing table in the
--    500 MB free-tier database, so a nightly pg_cron job deletes rows older
--    than 30 days. pg_cron is already installed on the project (v1.6.4);
--    cron.schedule() upserts by job name, so re-running this is safe.
--
-- 2) Drop `reviews` + `job_applications` — two tables from the deleted
--    freelancer marketplace that are provably safe to remove: 0 rows, no
--    foreign keys pointing INTO them, no DB functions referencing them, no
--    app code touching them (only the generated types file, which is
--    harmless). The OTHER legacy tables stay: `vano_payments` +
--    `student_profiles` are still written by stripe-webhook's legacy
--    branches, `community_posts` is read by useAuthContext's hasListing,
--    and `jobs` / `scouted_freelancers` are FK-referenced by other legacy
--    tables (conversations, notifications, saved_jobs, ai_find_requests).
--    Deliberately plain DROP TABLE (no CASCADE) so any dependency this
--    audit missed makes the migration fail loudly instead of silently
--    taking more with it.

-- 1) Nightly analytics retention (03:15 UTC, keep 30 days)
select cron.schedule(
  'vano-analytics-retention',
  '15 3 * * *',
  $$delete from public.analytics_events where created_at < now() - interval '30 days'$$
);

-- 2) Remove the two leaf tables of the deleted marketplace
drop table if exists public.reviews;
drop table if exists public.job_applications;
