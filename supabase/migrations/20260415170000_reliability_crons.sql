-- Reliability sweep: reap stale quote broadcasts + nudge hirers whose messages
-- went unanswered for 24h. Both are pure-SQL pg_cron jobs — no edge function
-- needed because neither requires external calls (push/email go through the
-- existing notifications table which other cron jobs already pick up).
--
-- Depends on:
--   - quote_broadcasts (20260415150000_quote_broadcasts.sql)
--   - notifications   (pre-existing)

-- ─── Broadcast expiry ──────────────────────────────────────────────────────
-- A broadcast that sat 'open' for 7 days with no reply is basically dead.
-- Flip it to 'expired' so the UI chip stops showing "waiting on first reply"
-- three weeks later.

CREATE OR REPLACE FUNCTION public.expire_stale_quote_broadcasts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.quote_broadcasts
     SET status = 'expired'
   WHERE status = 'open'
     AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_quote_broadcasts() IS
  'Mark broadcasts open for 7+ days as expired. Idempotent. Run on a cron.';

-- ─── Stale-quote nudge ─────────────────────────────────────────────────────
-- A hirer sent a message, the freelancer never replied, and 24h passed.
-- Drop a notification into the hirer''s inbox with a nudge. Tracked via a
-- column on conversations so we only nudge once per thread; re-nudging
-- would just annoy without recovering anything.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS stale_nudge_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.nudge_stale_hirer_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
BEGIN
  -- Find conversations where:
  --   (a) the most recent message is > 24h and < 7 days old (avoid ancient
  --       threads), (b) no freelancer (participant with user_type='student')
  --       has ever replied, (c) we haven''t already nudged this thread.
  FOR v_row IN
    SELECT c.id AS conversation_id,
           c.participant_1,
           c.participant_2,
           (SELECT user_type FROM public.profiles WHERE user_id = c.participant_1) AS p1_type,
           (SELECT user_type FROM public.profiles WHERE user_id = c.participant_2) AS p2_type
      FROM public.conversations c
      JOIN public.messages m ON m.conversation_id = c.id
     WHERE c.stale_nudge_sent_at IS NULL
       AND c.updated_at BETWEEN now() - interval '7 days' AND now() - interval '24 hours'
     GROUP BY c.id, c.participant_1, c.participant_2, c.updated_at
    HAVING
      -- At least one message from the business side
      COUNT(*) FILTER (
        WHERE m.sender_id = (
          CASE WHEN (SELECT user_type FROM public.profiles WHERE user_id = c.participant_1) = 'business'
               THEN c.participant_1 ELSE c.participant_2 END
        )
      ) > 0
      -- …and ZERO messages from the freelancer side.
      AND COUNT(*) FILTER (
        WHERE m.sender_id = (
          CASE WHEN (SELECT user_type FROM public.profiles WHERE user_id = c.participant_1) = 'student'
               THEN c.participant_1 ELSE c.participant_2 END
        )
      ) = 0
  LOOP
    -- Only act if we can confidently identify exactly one business + one
    -- freelancer pairing (skip business↔business or student↔student).
    IF NOT (
      (v_row.p1_type = 'business' AND v_row.p2_type = 'student')
      OR (v_row.p1_type = 'student' AND v_row.p2_type = 'business')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, title, message, read)
    VALUES (
      CASE WHEN v_row.p1_type = 'business' THEN v_row.participant_1 ELSE v_row.participant_2 END,
      'Still waiting on a reply?',
      'Your message hasn''t been opened yet. Want to try another freelancer? Tap to broadcast to the top matches.'
    );

    UPDATE public.conversations
       SET stale_nudge_sent_at = now()
     WHERE id = v_row.conversation_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.nudge_stale_hirer_conversations() IS
  'Drop a "still waiting?" notification into the hirer''s inbox when a message went 24h+ without a freelancer reply. One-shot per thread via conversations.stale_nudge_sent_at.';

-- ─── Schedule via pg_cron ──────────────────────────────────────────────────
do $$
declare
  has_pg_cron boolean;
begin
  select exists(select 1 from pg_extension where extname = 'pg_cron') into has_pg_cron;
  if not has_pg_cron then
    raise notice 'pg_cron not enabled — schedule these functions via Supabase Scheduled Functions instead.';
    return;
  end if;

  -- Broadcast expiry runs every hour — 7-day staleness means we don''t
  -- need minute-level precision.
  perform cron.schedule(
    'expire-stale-quote-broadcasts-hourly',
    '0 * * * *',
    $c$ select public.expire_stale_quote_broadcasts(); $c$
  );

  -- Stale-quote nudge runs every 3 hours — fast enough that hirers get a
  -- prompt within their browsing window, slow enough we don''t spam the
  -- notifications table with sub-second recompute.
  perform cron.schedule(
    'nudge-stale-hirer-conversations-3hr',
    '0 */3 * * *',
    $c$ select public.nudge_stale_hirer_conversations(); $c$
  );
end $$;
