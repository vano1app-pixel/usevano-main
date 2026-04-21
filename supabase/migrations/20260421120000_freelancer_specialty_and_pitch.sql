-- Freelancer-listing polish: give every freelancer a single "specialty"
-- within their category (the #1 dimension hirers filter by — weddings
-- vs events for videography, Shopify vs custom code for websites,
-- TikTok vs Instagram for content creators, B2B SaaS vs agencies for
-- digital sales). Category alone buckets too coarsely; specialty is
-- what turns "10 videographers" into "the 2 who actually shoot weddings."
--
-- Same migration also lands three structured pitch columns so the
-- onboarding wizard can replace its single 2000-char description
-- textarea with three prompted one-liners — every listing ends up with
-- consistent "who / what you deliver / why you" copy instead of a
-- freeform blob that half of freelancers write "lol I do videos" into.
-- The wizard still joins these into community_posts.description on
-- publish so the ranker, ai-find RPCs, and the legacy display path all
-- keep working unchanged.

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS specialty      text,
  ADD COLUMN IF NOT EXISTS pitch_who      text,
  ADD COLUMN IF NOT EXISTS pitch_deliver  text,
  ADD COLUMN IF NOT EXISTS pitch_why      text;

COMMENT ON COLUMN public.student_profiles.specialty IS
  'Category-specific specialty slug (e.g. "weddings" for videography, "shopify" for websites). Primary filter dimension on the talent board.';

COMMENT ON COLUMN public.student_profiles.pitch_who IS
  'Short answer: the kinds of clients this freelancer typically works with. Joined into community_posts.description on publish.';

COMMENT ON COLUMN public.student_profiles.pitch_deliver IS
  'Short answer: the one thing this freelancer delivers best. Joined into community_posts.description on publish.';

COMMENT ON COLUMN public.student_profiles.pitch_why IS
  'Short answer: why hire this freelancer. Joined into community_posts.description on publish.';
