-- Self-serve monthly plans (Home Pass / Family / Family Plus) paid via
-- Stripe subscription checkout. One row per subscription, written by
-- stripe-webhook on checkout.session.completed (mode=subscription) and
-- flipped to cancelled when customer.subscription.deleted arrives.
-- Ops source of truth stays Stripe; this table powers admin visibility
-- and future self-service management.

CREATE TABLE IF NOT EXISTS public.household_plan_subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan                    text NOT NULL,
  customer_name           text,
  customer_phone          text,
  customer_email          text,
  city                    text,
  stripe_subscription_id  text UNIQUE,
  stripe_customer_id      text,
  status                  text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','cancelled')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  cancelled_at            timestamptz
);

-- Contact details are PII: no anon/authenticated policies, service-role only.
ALTER TABLE public.household_plan_subscriptions ENABLE ROW LEVEL SECURITY;
