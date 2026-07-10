-- Atomic top-level merge of a JSON patch into household_bookings.booking_data.
--
-- Two crons write booking_data via read-modify-write from a stale snapshot:
--   • redispatch-stale-jobs sets { redispatch_round }
--   • notify-household-no-helpers sets { last_admin_alert_at, admin_alert_count }
-- They run on overlapping schedules (*/15 and */5) over the same pending rows
-- with slow HTTP between read and write, so each could clobber the other's
-- keys — reverting a redispatch_round past its cap, or resetting the admin
-- alert counter so the owner gets re-paged immediately.
--
-- The `||` operator merges at the top level server-side in ONE statement, so
-- each writer only ever sets its own keys and never overwrites the other's.
CREATE OR REPLACE FUNCTION public.merge_booking_data(p_id uuid, p_patch jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.household_bookings
  SET booking_data = COALESCE(booking_data, '{}'::jsonb) || p_patch
  WHERE id = p_id;
$$;

-- Service-role only (the crons). Never callable by anon/authenticated clients.
REVOKE ALL ON FUNCTION public.merge_booking_data(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.merge_booking_data(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.merge_booking_data(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.merge_booking_data(uuid, jsonb) TO service_role;
