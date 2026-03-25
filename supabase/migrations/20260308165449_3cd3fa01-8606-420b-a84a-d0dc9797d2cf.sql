ALTER TABLE public.push_subscriptions 
ADD COLUMN notify_gigs boolean NOT NULL DEFAULT true,
ADD COLUMN notify_messages boolean NOT NULL DEFAULT true;