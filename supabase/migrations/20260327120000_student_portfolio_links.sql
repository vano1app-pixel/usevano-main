-- TikTok + external work links for freelancers (community + profile)
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS work_links jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.student_profiles.work_links IS 'JSON array of {"url": string, "label": string | null} for past websites/projects';
