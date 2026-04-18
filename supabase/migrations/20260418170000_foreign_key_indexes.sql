-- Add covering indexes for 13 foreign keys that were flagged by the
-- Supabase performance advisor. Unindexed FK columns force a full
-- table scan on every JOIN through them (and on every parent-row
-- delete, which is what actually bites first — CASCADEs take an
-- exclusive lock while they scan).
--
-- The biggest wins:
--   messages.conversation_id       — every chat load
--   hire_requests.requester_id     — business dashboard
--   hire_requests.matched_freelancer_id — freelancer dashboard
--   notifications.job_id           — unread-count queries
--   saved_jobs.job_id              — "my saved" page
--
-- CONCURRENTLY is omitted because Supabase migrations run inside a
-- transaction (which forbids CONCURRENTLY). For this table size the
-- brief AccessExclusiveLock is negligible; if the tables grow much
-- larger these should be re-done out-of-band with CREATE INDEX
-- CONCURRENTLY.

create index if not exists ai_find_requests_vano_match_user_id_idx
  on public.ai_find_requests (vano_match_user_id);

create index if not exists ai_find_requests_web_scout_id_idx
  on public.ai_find_requests (web_scout_id);

create index if not exists community_listing_requests_user_id_idx
  on public.community_listing_requests (user_id);

create index if not exists event_registrations_event_id_idx
  on public.event_registrations (event_id);

create index if not exists events_created_by_idx
  on public.events (created_by);

create index if not exists feature_requests_user_id_idx
  on public.feature_requests (user_id);

create index if not exists hire_requests_requester_id_idx
  on public.hire_requests (requester_id);

create index if not exists hire_requests_matched_freelancer_id_idx
  on public.hire_requests (matched_freelancer_id);

create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id);

create index if not exists notifications_job_id_idx
  on public.notifications (job_id);

create index if not exists saved_jobs_job_id_idx
  on public.saved_jobs (job_id);

create index if not exists scouted_freelancers_claimed_user_id_idx
  on public.scouted_freelancers (claimed_user_id);

create index if not exists vano_payments_hire_agreement_id_idx
  on public.vano_payments (hire_agreement_id);
