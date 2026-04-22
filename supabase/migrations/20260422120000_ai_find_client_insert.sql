-- Allow authenticated users to insert their own ai_find_requests rows.
--
-- Context: the original design (see 20260417130000_ai_find_requests.sql)
-- kept writes service-role-only, routing everything through the
-- create-ai-find-checkout edge function. That gateway has been
-- intermittently rejecting valid JWTs (UNAUTHORIZED_INVALID_JWT_FORMAT),
-- blocking AI Find entirely. To restore the product we're switching the
-- client flow to a direct insert + Stripe Payment Link redirect, so the
-- critical path no longer depends on Supabase edge functions at all.
--
-- The policy is deliberately narrow:
--   - requester_id must equal auth.uid() (can't impersonate)
--   - status must be 'awaiting_payment' on insert (can't self-promote to paid)
--   - stripe_* / result columns must be null on insert (those are webhook-
--     and edge-function-owned; clients shouldn't seed them)
--
-- The stripe-webhook remains the only writer for status flips, paid_at,
-- stripe_payment_intent_id, etc. The only thing a client gains is the
-- ability to seed the row with their brief before redirecting to Stripe.

DROP POLICY IF EXISTS "ai_find_requests_insert_requester" ON public.ai_find_requests;
CREATE POLICY "ai_find_requests_insert_requester"
  ON public.ai_find_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'awaiting_payment'
    AND stripe_session_id IS NULL
    AND stripe_payment_intent_id IS NULL
    AND stripe_payment_status IS NULL
    AND vano_match_user_id IS NULL
    AND web_scout_id IS NULL
    AND paid_at IS NULL
    AND completed_at IS NULL
  );
