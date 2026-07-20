-- Hardening batch from the 2026-07-20 Supabase security lint.
-- ---------------------------------------------------------------------------
-- 1) Trigger-type SECURITY DEFINER functions carried default EXECUTE grants,
--    so the public API keys could *target* them via /rest/v1/rpc. PostgREST
--    can't actually invoke trigger-returning functions, and trigger firing
--    never checks the DML role's EXECUTE privilege (checked at CREATE TRIGGER
--    time) — so revoking is pure surface reduction with zero behaviour change.
--    The anonymous-customer RPCs (get_household_booking / get_household_chat /
--    send_household_chat / household_offer_count / recent_household_activity)
--    and has_role (evaluated inside RLS policies as the querying role) are
--    deliberately anon-callable and are NOT touched.
revoke execute on function public.accrue_referral_commission()             from public, anon, authenticated;
revoke execute on function public.accrue_referral_commission_direct_pay()  from public, anon, authenticated;
revoke execute on function public.auto_assign_admin()                      from public, anon, authenticated;
revoke execute on function public.handle_milestone_payout()                from public, anon, authenticated;
revoke execute on function public.handle_new_user()                        from public, anon, authenticated;
revoke execute on function public.increment_helper_accepted_count()        from public, anon, authenticated;
revoke execute on function public.link_helper_user_id()                    from public, anon, authenticated;
revoke execute on function public.post_hire_agreement_system_message()     from public, anon, authenticated;
revoke execute on function public.post_sales_milestone_message()           from public, anon, authenticated;
revoke execute on function public.resolve_referral_attribution()           from public, anon, authenticated;
revoke execute on function public.sync_sales_deal_bonus_from_payment()     from public, anon, authenticated;
revoke execute on function public.trg_autopilot_dispatch()                 from public, anon, authenticated;
revoke execute on function public.trigger_dispatch_household_job()         from public, anon, authenticated;
revoke execute on function public.update_post_likes_count()                from public, anon, authenticated;

-- 2) Pin search_path on the trigger functions that lacked one (search-path
--    hijack hardening). `public, pg_temp` matches the bodies' unqualified
--    table references — an empty path would break them at run time.
alter function public.increment_helper_accepted_count()  set search_path = public, pg_temp;
alter function public.trigger_dispatch_household_job()   set search_path = public, pg_temp;
alter function public.touch_household_booking()          set search_path = public, pg_temp;
alter function public.freelancer_wizard_drafts_touch()   set search_path = public, pg_temp;
alter function public.sales_deal_stamp_closed_at()       set search_path = public, pg_temp;
alter function public.household_helpers_autoapprove()    set search_path = public, pg_temp;
