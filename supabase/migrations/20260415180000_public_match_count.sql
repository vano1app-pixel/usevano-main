-- Public match counter for the landing-hero social-proof chip. Returns the
-- number of "business reaches out to freelancer" events in the last 7 days.
--
-- We expose this via an RPC instead of opening RLS on the raw analytics_events
-- table because the table also holds per-user event props that shouldn't be
-- readable by the public. The function aggregates into a single integer so
-- no PII leaks.

CREATE OR REPLACE FUNCTION public.public_recent_match_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::integer
    FROM public.analytics_events
   WHERE event IN ('quote_sent', 'direct_hire_sent', 'vano_match_sent', 'quote_broadcast_sent')
     AND created_at > now() - interval '7 days';
$$;

REVOKE ALL ON FUNCTION public.public_recent_match_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_recent_match_count() TO anon, authenticated;

COMMENT ON FUNCTION public.public_recent_match_count() IS
  'Aggregate-only public read: count of hiring-intent events (quote/hire/match sends) in the last 7 days. Used for the landing page social-proof chip.';
