-- Reply-time trust signal for public freelancer profiles.
--
-- Computes the median time between (the most recent message from someone else
-- in a thread) and (the freelancer's reply) over their last 50 sent messages.
-- Returns NULL when the freelancer has < 5 such reply pairs — the caller
-- shows a "New on Vano" pill in that case.
--
-- SECURITY DEFINER: messages.RLS scopes reads per-conversation-participant,
-- so a public profile viewer would otherwise see nothing. We expose only the
-- aggregate (a number of seconds), never message content.

CREATE OR REPLACE FUNCTION public.freelancer_median_reply_seconds(p_freelancer_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH replies AS (
    SELECT
      m.created_at AS replied_at,
      (
        SELECT MAX(prev.created_at)
        FROM public.messages prev
        WHERE prev.conversation_id = m.conversation_id
          AND prev.sender_id <> p_freelancer_id
          AND prev.created_at < m.created_at
      ) AS prompted_at
    FROM public.messages m
    WHERE m.sender_id = p_freelancer_id
    ORDER BY m.created_at DESC
    LIMIT 50
  ),
  deltas AS (
    SELECT EXTRACT(EPOCH FROM (replied_at - prompted_at))::numeric AS secs
    FROM replies
    WHERE prompted_at IS NOT NULL
      AND replied_at > prompted_at
  )
  SELECT CASE
    WHEN COUNT(*) FILTER (WHERE secs IS NOT NULL) < 5 THEN NULL
    ELSE PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY secs)::integer
  END
  FROM deltas;
$$;

REVOKE ALL ON FUNCTION public.freelancer_median_reply_seconds(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freelancer_median_reply_seconds(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.freelancer_median_reply_seconds(uuid) IS
  'Median reply time in seconds for a freelancer (last 50 sent messages, requires >= 5 reply pairs). NULL if too new.';
