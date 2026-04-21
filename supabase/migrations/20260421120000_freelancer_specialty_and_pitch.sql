-- Freelancer-listing polish: give every freelancer a single "specialty"
-- within their category (the #1 dimension hirers filter by — weddings
-- vs events for videography, Shopify vs custom code for websites,
-- TikTok vs Instagram for content creators, B2B SaaS vs agencies for
-- digital sales). Category alone buckets too coarsely; specialty is
-- what turns "10 videographers" into "the 2 who actually shoot weddings."
--
-- Same migration also lands two tag-style columns so the onboarding
-- wizard can replace its single 2000-char description textarea with
-- pill pickers instead of text inputs. Every listing ends up with
-- consistent, queryable metadata ("who you work with", "what sets
-- you apart") rather than a freeform blob that half of freelancers
-- write "lol I do videos" into. The wizard still derives a
-- community_posts.description string from these columns on publish
-- so the ranker, ai-find RPCs, and the legacy display path all keep
-- working unchanged.

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS specialty      text,
  ADD COLUMN IF NOT EXISTS client_types   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS strengths      text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.student_profiles.specialty IS
  'Category-specific specialty slug (e.g. "weddings" for videography, "shopify" for websites). Primary filter dimension on the talent board.';

COMMENT ON COLUMN public.student_profiles.client_types IS
  'Tag array — the kinds of clients this freelancer typically works with (e.g. {"couples","event_venues"} for videography). Wizard collects via a pill-picker on Step 2.';

COMMENT ON COLUMN public.student_profiles.strengths IS
  'Tag array — universal strength slugs like "fast_turnaround" or "own_gear". Wizard collects via a pill-picker on Step 2; card renders up to 3 as icon chips.';
