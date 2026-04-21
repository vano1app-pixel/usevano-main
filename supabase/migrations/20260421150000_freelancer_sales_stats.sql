-- Public aggregate stats for a digital-sales freelancer's track
-- record: count of closed_won deals + lifetime paid bonus total.
-- Drives a "3 deals closed · €2.4k earned" chip on the discovery
-- board so hiring businesses see proof-of-work instead of
-- self-reported claims.
--
-- SECURITY DEFINER with an aggregate-only return: the sales_deals
-- RLS restricts row reads to deal participants, but the counts +
-- totals we expose here don't leak any lead-level info (no names,
-- no companies, no deal sizes). Anyone can call it; it just returns
-- zeros for freelancers who've never closed a deal.

CREATE OR REPLACE FUNCTION public.freelancer_sales_stats(p_freelancer_id uuid)
RETURNS TABLE (
  closed_won_count      integer,
  paid_bonus_cents_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*) FILTER (WHERE stage = 'closed_won')::integer           AS closed_won_count,
    COALESCE(
      SUM(bonus_amount_cents) FILTER (WHERE bonus_status = 'paid'),
      0
    )::bigint                                                        AS paid_bonus_cents_total
  FROM public.sales_deals
  WHERE freelancer_id = p_freelancer_id;
$$;

REVOKE ALL ON FUNCTION public.freelancer_sales_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freelancer_sales_stats(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.freelancer_sales_stats(uuid) IS
  'Aggregate sales stats for a freelancer (closed_won count + paid bonus total in cents). Safe for public display — no lead-level data returned.';
