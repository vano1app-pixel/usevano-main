
-- ═══ 20260421120000_freelancer_specialty_and_pitch ═══
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

-- ═══ 20260421130000_sales_deals_pipeline ═══
-- Digital-sales deal pipeline: give sales freelancers and the
-- businesses that hire them a shared, queryable record of every lead
-- the freelancer sources. Without this, "expected bonus per deal" in
-- the onboarding wizard is a handshake number — nobody can agree on
-- what closed, when, or what it was worth.
--
-- Data model:
--   1. sales_deals: one row per lead the freelancer logs. Stage
--      machine moves sourced → qualified → meeting → proposal →
--      closed_won | closed_lost. Bonus rate + unit are snapshotted
--      onto the row at close time so a mid-engagement change to the
--      freelancer's profile doesn't retroactively affect past deals.
--   2. sales_deal_events: immutable audit trail of every stage
--      transition and bonus action. Kept separate from the main row
--      so "who moved this to closed_won" survives any future UPDATE.
--
-- Payout is a follow-up — the "pay bonus" button creates a
-- vano_payments row via the existing Vano Pay RPC. This migration
-- just lands the pipeline, not the money-movement hook.

CREATE TABLE IF NOT EXISTS public.sales_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Participants. The freelancer is the one selling; the business is
  -- the client who hired them. Both sides can read and annotate the
  -- row via the RLS policies below.
  freelancer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Optional conversation pointer so the pipeline row can open back
  -- to the thread where the hire happened. Not a hard requirement at
  -- insert time because a freelancer might log a lead before a
  -- conversation thread exists (rare, but Vano doesn't enforce it).
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,

  -- Lead metadata. Name + company are the minimum freelancers log
  -- when sourcing; both are required so we can't end up with an
  -- unlabelled row nobody recognises six weeks later.
  lead_name    text NOT NULL CHECK (char_length(lead_name) BETWEEN 1 AND 140),
  lead_company text NOT NULL CHECK (char_length(lead_company) BETWEEN 1 AND 140),
  notes        text CHECK (notes IS NULL OR char_length(notes) <= 1000),

  -- Deal value in cents. Nullable until the deal progresses past
  -- `qualified` — freelancer fills it in when there's a real number
  -- to attach. Commission math uses this.
  deal_amount_cents int CHECK (deal_amount_cents IS NULL OR deal_amount_cents >= 0),

  -- Pipeline stage. The list is open-ended enough to cover every
  -- category of work on Vano (SaaS / agencies / services) without
  -- being so granular that the UI needs 12 columns.
  stage text NOT NULL DEFAULT 'sourced'
    CHECK (stage IN ('sourced','qualified','meeting','proposal','closed_won','closed_lost')),

  -- Bonus snapshot — captured at close time from the freelancer's
  -- student_profiles row so a later rate change doesn't
  -- retroactively alter a booked deal. rate + unit together describe
  -- "10% of deal_amount" vs "€50 per client." Computed value in
  -- cents lives in bonus_amount_cents.
  bonus_rate numeric(12,4),
  bonus_unit text CHECK (bonus_unit IN ('percentage','flat')),
  bonus_amount_cents int CHECK (bonus_amount_cents IS NULL OR bonus_amount_cents >= 0),

  -- Bonus payout tracking. Moves independently of `stage` so a deal
  -- can be `closed_won` with bonus still `pending`. Terminal states
  -- are `paid` (Vano Pay transfer confirmed) and `waived` (business
  -- says no, freelancer acknowledged).
  bonus_status text NOT NULL DEFAULT 'pending'
    CHECK (bonus_status IN ('pending','approved','paid','waived','disputed')),
  -- Foreign pointer to the vano_payments row that settled the bonus,
  -- once the bonus-payout RPC fires. Loose reference (no FK) so we
  -- don't need to re-deploy this migration if vano_payments ever
  -- changes schema.
  bonus_payment_id uuid,

  closed_at  timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Hot indexes for the pipeline UI. Freelancer view renders "my open
-- deals by stage" → ordered (freelancer_id, stage, updated_at);
-- business view renders "deals by this freelancer" → ordered
-- (business_id, updated_at).
CREATE INDEX IF NOT EXISTS sales_deals_freelancer_stage_idx
  ON public.sales_deals (freelancer_id, stage, updated_at DESC);

CREATE INDEX IF NOT EXISTS sales_deals_business_updated_idx
  ON public.sales_deals (business_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS sales_deals_conversation_idx
  ON public.sales_deals (conversation_id);

ALTER TABLE public.sales_deals ENABLE ROW LEVEL SECURITY;

-- Participants (freelancer + business) read their own deals. Mirrors
-- the vano_payments SELECT policy so the same mental model applies.
DROP POLICY IF EXISTS "sales_deals_select_participants" ON public.sales_deals;
CREATE POLICY "sales_deals_select_participants"
  ON public.sales_deals
  FOR SELECT
  TO authenticated
  USING (freelancer_id = auth.uid() OR business_id = auth.uid());

-- Freelancer logs their own leads. Business is identified via the
-- insert payload (they're the client the freelancer is working for);
-- the freelancer can't fabricate a deal on a business they don't
-- have a conversation with — the UI gates the business dropdown to
-- existing hire relationships, but if a malicious client bypasses
-- the UI the worst they can do is pollute their own pipeline view
-- with a fake lead naming a business they know. Acceptable risk.
DROP POLICY IF EXISTS "sales_deals_insert_freelancer" ON public.sales_deals;
CREATE POLICY "sales_deals_insert_freelancer"
  ON public.sales_deals
  FOR INSERT
  TO authenticated
  WITH CHECK (freelancer_id = auth.uid());

-- Either party can update a deal they're on. Freelancer typically
-- drives sourced → proposal; business drives closed_won / closed_lost
-- and the bonus lifecycle. The UI handles the human role split; RLS
-- stays permissive so we don't block legit updates.
DROP POLICY IF EXISTS "sales_deals_update_participants" ON public.sales_deals;
CREATE POLICY "sales_deals_update_participants"
  ON public.sales_deals
  FOR UPDATE
  TO authenticated
  USING (freelancer_id = auth.uid() OR business_id = auth.uid())
  WITH CHECK (freelancer_id = auth.uid() OR business_id = auth.uid());

-- Freelancer can delete their own pending leads (e.g. a typo) but
-- can't nuke a closed deal once it's booked. Business can't delete
-- at all — disputes go through bonus_status, not a DELETE.
DROP POLICY IF EXISTS "sales_deals_delete_freelancer_open" ON public.sales_deals;
CREATE POLICY "sales_deals_delete_freelancer_open"
  ON public.sales_deals
  FOR DELETE
  TO authenticated
  USING (
    freelancer_id = auth.uid()
    AND stage NOT IN ('closed_won','closed_lost')
  );

DROP TRIGGER IF EXISTS update_sales_deals_updated_at ON public.sales_deals;
CREATE TRIGGER update_sales_deals_updated_at
  BEFORE UPDATE ON public.sales_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- When a deal transitions to a terminal stage, snapshot the close
-- timestamp so the pipeline UI can render "closed X days ago"
-- without recomputing from an audit trail. Idempotent — the column
-- is only stamped the first time the deal enters closed_won /
-- closed_lost, so subsequent UPDATEs (e.g. bonus payout) don't
-- rewrite it.
CREATE OR REPLACE FUNCTION public.sales_deal_stamp_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.stage IN ('closed_won','closed_lost')
     AND (OLD.stage IS NULL OR OLD.stage NOT IN ('closed_won','closed_lost'))
  THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_deals_closed_at_trg ON public.sales_deals;
CREATE TRIGGER sales_deals_closed_at_trg
  BEFORE UPDATE ON public.sales_deals
  FOR EACH ROW EXECUTE FUNCTION public.sales_deal_stamp_closed_at();


COMMENT ON TABLE public.sales_deals IS
  'Shared pipeline between a digital-sales freelancer and each business they work for. Freelancer logs leads, both parties move the stage, bonus amount is computed from the freelancer''s snapshot rate at close time.';
COMMENT ON COLUMN public.sales_deals.bonus_rate IS
  'Rate captured at close time (e.g. 10 = 10% for percentage unit, or €50 for flat unit). Decoupled from the live student_profiles value so historical deals stay stable.';
COMMENT ON COLUMN public.sales_deals.bonus_amount_cents IS
  'Computed bonus in cents. Null until stage=closed_won AND deal_amount_cents is set (percentage case) or bonus_rate is set (flat case).';
COMMENT ON COLUMN public.sales_deals.bonus_status IS
  'Bonus lifecycle: pending (just closed, awaiting business approval) → approved (business confirmed) → paid (vano_payment cleared). Terminal: waived or disputed.';
COMMENT ON COLUMN public.sales_deals.bonus_payment_id IS
  'Loose pointer to the vano_payments row that settled this bonus. No FK so the pipeline schema survives vano_payments changes.';

-- ═══ 20260421140000_sales_deals_bonus_payout ═══
-- Close the digital-sales bonus-payout loop: when a business approves
-- a `closed_won` deal and pays the bonus through Vano Pay, the
-- resulting vano_payments row needs to be able to find its way back
-- to the originating sales_deals row so the pipeline UI can flip
-- `bonus_status` from `approved` → `paid` automatically once the
-- Stripe webhook confirms the transfer.
--
-- Design:
--   1. vano_payments.sales_deal_id — nullable, loose reference (no FK)
--      to keep the column forgiving if either schema evolves
--      separately. Stamped by create-vano-payment-checkout when the
--      checkout originates from the "Pay bonus" button in the
--      BusinessDealsPanel; null for every other Vano Pay flow.
--   2. Trigger on vano_payments UPDATE mirrors status transitions
--      onto sales_deals:
--        - status → 'transferred' ⇒ sales_deals.bonus_status = 'paid'
--          + bonus_payment_id stamped.
--        - status → 'refunded'    ⇒ sales_deals.bonus_status = 'disputed'
--          + bonus_payment_id cleared so the business can pay again if
--          the refund was a mistake.
--      Runs SECURITY DEFINER so the webhook service role can update
--      sales_deals without needing a dedicated RLS policy for cross-
--      table writes.

ALTER TABLE public.vano_payments
  ADD COLUMN IF NOT EXISTS sales_deal_id uuid;

CREATE INDEX IF NOT EXISTS vano_payments_sales_deal_idx
  ON public.vano_payments (sales_deal_id)
  WHERE sales_deal_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_sales_deal_bonus_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react when (a) this payment is linked to a deal, and
  -- (b) the status actually moved. Guards against the trigger firing
  -- on unrelated column updates (e.g. description edits).
  IF NEW.sales_deal_id IS NOT NULL
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF NEW.status = 'transferred' THEN
      UPDATE public.sales_deals
         SET bonus_status = 'paid',
             bonus_payment_id = NEW.id
       WHERE id = NEW.sales_deal_id
         AND bonus_status IN ('approved', 'pending');
    ELSIF NEW.status = 'refunded' THEN
      UPDATE public.sales_deals
         SET bonus_status = 'disputed',
             bonus_payment_id = NULL
       WHERE id = NEW.sales_deal_id
         AND bonus_payment_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vano_payments_sync_sales_deal ON public.vano_payments;
CREATE TRIGGER vano_payments_sync_sales_deal
  AFTER UPDATE ON public.vano_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sales_deal_bonus_from_payment();


COMMENT ON COLUMN public.vano_payments.sales_deal_id IS
  'Loose pointer back to the sales_deals row that triggered this payment. Populated only for digital-sales bonus payouts — other Vano Pay flows leave it null.';

-- ═══ 20260421150000_freelancer_sales_stats ═══
-- Public aggregate stats for a digital-sales freelancer's track
-- record: count of closed_won deals + lifetime paid bonus total.
-- Drives a "3 deals closed · €2.4k earned" chip on the discovery
-- board so hiring businesses see proof-of-work instead of
-- self-reported claims.
--
-- SECURITY DEFINER with an aggregate-only return: the sales_deals
-- RLS restricts row reads to deal participants, but the counts +
-- totals we expose here don't leak any lead-level info (no names,
-- no companies, no deal sizes). Anyone can call it; it just returns
-- zeros for freelancers who've never closed a deal.

CREATE OR REPLACE FUNCTION public.freelancer_sales_stats(p_freelancer_id uuid)
RETURNS TABLE (
  closed_won_count      integer,
  paid_bonus_cents_total bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COUNT(*) FILTER (WHERE stage = 'closed_won')::integer           AS closed_won_count,
    COALESCE(
      SUM(bonus_amount_cents) FILTER (WHERE bonus_status = 'paid'),
      0
    )::bigint                                                        AS paid_bonus_cents_total
  FROM public.sales_deals
  WHERE freelancer_id = p_freelancer_id;
$$;

REVOKE ALL ON FUNCTION public.freelancer_sales_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.freelancer_sales_stats(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.freelancer_sales_stats(uuid) IS
  'Aggregate sales stats for a freelancer (closed_won count + paid bonus total in cents). Safe for public display — no lead-level data returned.';

-- ═══ 20260422120000_ai_find_client_insert ═══
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

-- ═══ 20260422130000_ai_find_client_complete ═══
-- Allow the requester to complete their own ai_find_requests row
-- client-side. Needed because the ai-find-freelancer edge function
-- has been failing intermittently (gateway 401 / Gemini timeouts),
-- leaving paying hirers staring at a forever-loading screen with no
-- match. The client now does a simple category-based match against
-- community_posts and writes the result directly.
--
-- The policy is deliberately narrow:
--   - requester_id must equal auth.uid() on both sides (can't touch
--     other people's rows or reassign ownership)
--   - the row must currently be in a non-terminal state — clients can
--     promote awaiting_payment / paid / scouting → complete, but they
--     can't undo a completed/refunded/failed row
--   - the new row must be 'complete' with a vano_match_user_id set —
--     no flipping to other statuses, no clearing the match
--
-- Why not also gate on stripe_session_id? Because the webhook may not
-- have stamped it yet (the same outage that made client completion
-- necessary in the first place). The hirer is already authenticated
-- and owns the row; the worst-case abuse is a free "match" against
-- public freelancer profiles that are already visible on /freelancer/:id.

DROP POLICY IF EXISTS "ai_find_requests_update_requester_complete" ON public.ai_find_requests;
CREATE POLICY "ai_find_requests_update_requester_complete"
  ON public.ai_find_requests
  FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    AND status IN ('awaiting_payment', 'paid', 'scouting')
  )
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'complete'
    AND vano_match_user_id IS NOT NULL
  );

-- ═══ 20260423120000_freelancer_wizard_drafts ═══
-- Server-side backup for the ListOnCommunity wizard draft.
--
-- Context: the wizard already persists its in-progress state to
-- localStorage on every keystroke, which works great for a single-device
-- session. It falls over the moment a freelancer fills Step 1 on mobile
-- then switches to desktop — the draft is device-local only, so the
-- desktop lands on a blank form and they start from zero.
--
-- This table mirrors the same JSON blob the wizard already writes to
-- localStorage, keyed by user_id. The client treats localStorage as the
-- source of truth on mount (so existing users are unaffected); the
-- server row is only consulted when localStorage is empty AND the server
-- row is fresh (<7 days). On publish, the client clears both sides.
--
-- Purely additive — no other code paths read this table, and drafts are
-- never promoted to student_profiles until the user hits Publish through
-- the existing wizard flow.

CREATE TABLE IF NOT EXISTS public.freelancer_wizard_drafts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.freelancer_wizard_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "freelancer_wizard_drafts_select_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_select_own"
  ON public.freelancer_wizard_drafts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "freelancer_wizard_drafts_upsert_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_upsert_own"
  ON public.freelancer_wizard_drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "freelancer_wizard_drafts_update_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_update_own"
  ON public.freelancer_wizard_drafts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "freelancer_wizard_drafts_delete_own" ON public.freelancer_wizard_drafts;
CREATE POLICY "freelancer_wizard_drafts_delete_own"
  ON public.freelancer_wizard_drafts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.freelancer_wizard_drafts_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS freelancer_wizard_drafts_touch ON public.freelancer_wizard_drafts;
CREATE TRIGGER freelancer_wizard_drafts_touch
  BEFORE UPDATE ON public.freelancer_wizard_drafts
  FOR EACH ROW EXECUTE FUNCTION public.freelancer_wizard_drafts_touch();

-- ═══ 20260423140000_profile_views ═══
-- Profile view tracking — lightweight signal that drives retention on
-- the freelancer side. The "N views this week" card on /profile is a
-- cheap dopamine loop that gets freelancers coming back to update
-- their listing.
--
-- Design:
--   - One row per view, append-only. Good enough for <500 freelancers
--     at current scale; a weekly sweep can prune rows older than 90
--     days if the table ever grows.
--   - viewer_id is nullable so anon visitors count too (most profile
--     views come from signed-out hirers browsing). We accept the
--     abuse vector (someone could script inflation) because (a) it
--     only inflates their own count, nobody else's, and (b) the
--     RPC below skips self-views by authenticated viewers, which is
--     the one case where a freelancer could farm their own number.
--   - `record_profile_view` is SECURITY DEFINER so anon visitors can
--     call it. It's intentionally dumb — one INSERT, no dedupe by IP,
--     no rate limit. Keep it that way unless abuse becomes visible;
--     premature hardening cost us the counter working at all during
--     Stage 3 when we gated inserts behind a weekly unique constraint.

CREATE TABLE IF NOT EXISTS public.profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_views_viewed_user_id_viewed_at_idx
  ON public.profile_views (viewed_user_id, viewed_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

-- Only the profile owner can read their view history. Protects who-
-- viewed-whom from leaking across users. Aggregate counts (what the
-- UI needs) go through this same policy with a head-count query, so
-- no separate privilege needed.
DROP POLICY IF EXISTS "profile_views_select_own" ON public.profile_views;
CREATE POLICY "profile_views_select_own"
  ON public.profile_views
  FOR SELECT
  TO authenticated
  USING (viewed_user_id = auth.uid());

-- No direct INSERT policy — inserts go through record_profile_view()
-- below so the self-view skip and viewer_id stamping are enforced
-- server-side rather than trusting every client.

CREATE OR REPLACE FUNCTION public.record_profile_view(_viewed_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _viewer uuid := auth.uid();
BEGIN
  IF _viewed_user_id IS NULL THEN
    RETURN;
  END IF;
  -- Self-views don't count. Without this a freelancer could sit on
  -- their own profile and watch the counter climb, which is both
  -- boring and misleading. Anon visitors (auth.uid() IS NULL) always
  -- count.
  IF _viewer IS NOT NULL AND _viewer = _viewed_user_id THEN
    RETURN;
  END IF;
  INSERT INTO public.profile_views (viewed_user_id, viewer_id)
  VALUES (_viewed_user_id, _viewer);
END
$$;

GRANT EXECUTE ON FUNCTION public.record_profile_view(uuid) TO anon, authenticated;

-- Tell PostgREST to refresh its schema cache immediately so the client can
-- see the new columns/tables without waiting 10 minutes for the auto-refresh.
NOTIFY pgrst, 'reload schema';
