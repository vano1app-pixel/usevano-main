-- Track engagement push notifications per subscription
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS last_engagement_push timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_engagement_message_id text DEFAULT NULL;
