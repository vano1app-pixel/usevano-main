-- Demo seed: creates a held Vano Pay payment in an existing conversation
-- so you can demo the Release + Flag-a-problem flow end-to-end without
-- actually running a Stripe checkout. Safe to run multiple times — each
-- run creates a fresh row with a unique id.
--
-- Use when:
--   - You're about to show investors the escrow feature live.
--   - Stripe test mode is flaky or you don't want to punch through the
--     full checkout path during the demo.
--
-- Usage:
--   1. Replace the three UUIDs below with real values from your DB:
--      - DEMO_CONVERSATION_ID: an existing conversation between your
--        demo hirer and demo freelancer.
--      - DEMO_BUSINESS_ID: the hirer's auth.users.id.
--      - DEMO_FREELANCER_ID: the freelancer's auth.users.id.
--   2. Replace DEMO_FREELANCER_STRIPE_ACCOUNT with the freelancer's
--      stripe_account_id (from student_profiles). This is required so
--      the Release button has somewhere real to transfer to in test
--      mode; if you're only demoing the UI and won't actually click
--      Release, any test-mode acct_... will do.
--   3. Replace DEMO_PAYMENT_INTENT with a real Stripe test-mode
--      payment intent id. If you're not going to click Release, a
--      placeholder like 'pi_demo_seed' is fine — release will fail
--      loudly rather than silently. For a real end-to-end demo,
--      actually run one test checkout first and copy the pi_ id.
--
-- To find the first two:
--   SELECT id, participant_1, participant_2 FROM conversations LIMIT 5;
--
-- To find the freelancer's stripe_account_id:
--   SELECT stripe_account_id FROM student_profiles WHERE user_id = '<freelancer_id>';

DO $$
DECLARE
  DEMO_CONVERSATION_ID    uuid := '00000000-0000-0000-0000-000000000000'::uuid;  -- REPLACE ME
  DEMO_BUSINESS_ID        uuid := '00000000-0000-0000-0000-000000000000'::uuid;  -- REPLACE ME
  DEMO_FREELANCER_ID      uuid := '00000000-0000-0000-0000-000000000000'::uuid;  -- REPLACE ME
  DEMO_FREELANCER_STRIPE_ACCOUNT text := 'acct_test_REPLACE_ME';
  DEMO_PAYMENT_INTENT     text := 'pi_demo_REPLACE_ME';
  demo_amount_cents       int  := 15000;   -- €150.00
  demo_fee_cents          int  := 450;     -- 3% of 15000 = 450
  new_payment_id          uuid;
BEGIN
  INSERT INTO public.vano_payments (
    business_id,
    freelancer_id,
    conversation_id,
    description,
    amount_cents,
    fee_cents,
    currency,
    stripe_session_id,
    stripe_payment_intent_id,
    stripe_destination_account_id,
    status,
    paid_at,
    auto_release_at
  ) VALUES (
    DEMO_BUSINESS_ID,
    DEMO_FREELANCER_ID,
    DEMO_CONVERSATION_ID,
    'Demo payment — hand-picked match',
    demo_amount_cents,
    demo_fee_cents,
    'eur',
    'cs_demo_' || gen_random_uuid()::text,
    DEMO_PAYMENT_INTENT,
    DEMO_FREELANCER_STRIPE_ACCOUNT,
    'paid',
    now(),
    now() + interval '14 days'
  )
  RETURNING id INTO new_payment_id;

  -- Bump the conversation so the thread surfaces in both inboxes.
  UPDATE public.conversations
    SET updated_at = now()
    WHERE id = DEMO_CONVERSATION_ID;

  RAISE NOTICE 'Seeded held Vano Pay row: %', new_payment_id;
  RAISE NOTICE 'Amount: €%.00 · fee: €%.00 · auto-releases: %',
    demo_amount_cents / 100.0,
    demo_fee_cents / 100.0,
    (now() + interval '14 days')::date;
END $$;

-- Cleanup helper: drops every demo-seeded held payment in one go.
-- Uncomment to use.
-- DELETE FROM public.vano_payments
-- WHERE stripe_session_id LIKE 'cs_demo_%'
--   AND status = 'paid';
