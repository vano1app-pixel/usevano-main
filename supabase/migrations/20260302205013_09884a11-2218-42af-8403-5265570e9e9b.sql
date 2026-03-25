
-- Add avatar_url, bio, and work_description to profiles table for all user types
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS bio text DEFAULT '',
ADD COLUMN IF NOT EXISTS work_description text DEFAULT '';
