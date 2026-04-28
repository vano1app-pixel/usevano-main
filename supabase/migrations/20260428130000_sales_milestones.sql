-- Target-based commissions for digital-sales engagements (the
-- "every 3 deals = €1,500" model). Lets a business + sales rep agree
-- a target once, log deals through the existing kanban as usual, and
-- have ONE bonus payout fire when the count hits the target — instead
-- of paying per-deal. Per-deal still works (just set target_count = 1).
--
-- Three tables touched:
--   1. conversations  — gets the target rule (count + bonus), a paid
--                       counter for the running cycle, and a pending
--                       flag so we don't fire two milestones at once.
--   2. messages       — gets a `kind` discriminator + `metadata` jsonb
--                       so the milestone card can be rendered specially
--                       (auto-card with deal list + Pay button) instead
--                       of a regular text bubble. The columns are
--                       generic; future system-card types reuse them.
--   3. vano_payments  — gets `is_sales_milestone_payment` so the
--                       payout webhook trigger can tell a milestone
--                       payout apart from a regular Vano Pay or a
--                       per-deal sales bonus.
--
-- Two trigger functions:
--   post_sales_milestone_message()  — fires on sales_deals UPDATE
--                                     when a deal flips to closed_won.
--                                     Computes count − paid_count and
--                                     drops the milestone card if the
--                                     target's been hit AND no card is
--                                     already pending.
--   handle_milestone_payout()       — fires on vano_payments UPDATE
--                                     when status flips to transferred
--                                     AND the row is a milestone
--                                     payment. Increments paid_count
--                                     by target_count and clears the
--                                     pending flag so the next cycle
--                                     can fire.
--
-- Per-deal flow is unaffected by everything in this migration. The
-- target trigger only fires when a conversation has a target set
-- (sales_target_count IS NOT NULL); for every other conversation the
-- function early-returns and the existing BusinessDealsPanel
-- per-deal Confirm/Pay flow keeps working as it does today.

-- ── conversations: the target rule + cycle state ──────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sales_target_count int CHECK (sales_target_count IS NULL OR sales_target_count BETWEEN 1 AND 50),
  ADD COLUMN IF NOT EXISTS sales_target_bonus_cents int CHECK (sales_target_bonus_cents IS NULL OR sales_target_bonus_cents >= 100),
  -- Running count of deals already covered by previous milestone
  -- payouts. Increments by sales_target_count after each successful
  -- transfer; the unpaid-cycle progress is
  -- count(closed_won deals for conversation) − sales_target_paid_count.
  ADD COLUMN IF NOT EXISTS sales_target_paid_count int NOT NULL DEFAULT 0,
  -- True between "milestone fired" and "milestone paid". Stops the
  -- trigger from spamming a second card if the rep closes another
  -- deal before the first payout lands.
  ADD COLUMN IF NOT EXISTS sales_target_milestone_pending boolean NOT NULL DEFAULT false,
  -- Audit timestamp for "when the target was set on this engagement".
  -- Display-only; not used in any math.
  ADD COLUMN IF NOT EXISTS sales_target_set_at timestamptz;

COMMENT ON COLUMN public.conversations.sales_target_count IS
  'Target number of closed_won deals before a bonus is due (target-based commission model). NULL means the per-deal model applies. 1 means per-deal effectively.';
COMMENT ON COLUMN public.conversations.sales_target_bonus_cents IS
  'Bonus paid out per cycle (= per target_count deals). NULL when no target is set.';
COMMENT ON COLUMN public.conversations.sales_target_paid_count IS
  'Cumulative deals covered by previous milestone payouts. Drives the "deals in current cycle" math: progress = count(closed_won) - paid_count.';
COMMENT ON COLUMN public.conversations.sales_target_milestone_pending IS
  'True once a milestone card has been dropped into the chat and is awaiting payment. Cleared when the payout transfers (handle_milestone_payout trigger).';

-- ── messages: kind + metadata for system cards ────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.messages.kind IS
  'Discriminator for system-rendered cards. NULL = ordinary chat message. ''sales_milestone'' = target-based commission milestone card. Free for future card types (e.g. ''hire_summary'') without further migrations.';
COMMENT ON COLUMN public.messages.metadata IS
  'Card-specific structured data. For sales_milestone: { target_count, bonus_cents, deal_ids: [..] } captured at trigger-fire time so the card renders consistently even if a deal stage changes later.';

-- ── vano_payments: milestone marker ───────────────────────────────
ALTER TABLE public.vano_payments
  ADD COLUMN IF NOT EXISTS is_sales_milestone_payment boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.vano_payments.is_sales_milestone_payment IS
  'True when this payment was initiated from a target-based milestone card (vs. a per-deal sales bonus or a regular Vano Pay). Read by handle_milestone_payout to advance the conversation cycle on transfer.';

-- ── Trigger function 1: drop a milestone card when a target is hit ─
CREATE OR REPLACE FUNCTION public.post_sales_milestone_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_closed_won_count int;
  v_progress int;
  v_rep_name text;
  v_deal_ids uuid[];
  v_bonus_euro text;
BEGIN
  -- Only run on the meaningful transition: any-stage → closed_won.
  -- A row that's already closed_won (e.g. an idempotent UPDATE) gets
  -- skipped; same for stages going the other direction.
  IF NEW.stage IS DISTINCT FROM 'closed_won' THEN
    RETURN NEW;
  END IF;
  IF OLD IS NOT NULL AND OLD.stage = 'closed_won' THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Per-deal engagements (no target set) are handled by the existing
  -- BusinessDealsPanel Confirm/Pay flow — early-return so we don't
  -- interfere with that path.
  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND
     OR v_conversation.sales_target_count IS NULL
     OR v_conversation.sales_target_bonus_cents IS NULL THEN
    RETURN NEW;
  END IF;

  -- One unsettled milestone at a time. If the previous card hasn't
  -- been paid yet, don't drop another one — the rep is "ahead" but
  -- the business shouldn't be looking at two cards.
  IF v_conversation.sales_target_milestone_pending THEN
    RETURN NEW;
  END IF;

  -- Count closed_won deals for this conversation. The currently-
  -- updating row has just flipped to closed_won so it's already
  -- visible to the count (we're inside an AFTER UPDATE trigger).
  SELECT count(*) INTO v_closed_won_count
  FROM public.sales_deals
  WHERE conversation_id = NEW.conversation_id
    AND stage = 'closed_won';

  v_progress := v_closed_won_count - v_conversation.sales_target_paid_count;
  IF v_progress < v_conversation.sales_target_count THEN
    RETURN NEW;
  END IF;

  -- We've hit the target. Capture the deal IDs that make up THIS
  -- milestone (the target_count most-recently closed deals beyond the
  -- already-paid offset), so the card renders consistently even if a
  -- deal is later moved out of closed_won.
  SELECT array_agg(id ORDER BY closed_at NULLS LAST, created_at) INTO v_deal_ids
  FROM (
    SELECT id, closed_at, created_at
    FROM public.sales_deals
    WHERE conversation_id = NEW.conversation_id
      AND stage = 'closed_won'
    ORDER BY closed_at NULLS LAST, created_at
    OFFSET v_conversation.sales_target_paid_count
    LIMIT v_conversation.sales_target_count
  ) x;

  SELECT display_name INTO v_rep_name
  FROM public.profiles
  WHERE user_id = NEW.freelancer_id;

  v_bonus_euro := to_char(v_conversation.sales_target_bonus_cents / 100.0, 'FM999G999D00');

  INSERT INTO public.messages (conversation_id, sender_id, content, kind, metadata)
  VALUES (
    NEW.conversation_id,
    NEW.freelancer_id,
    format(
      '🎯 %s hit a %s-deal target. Bonus due: €%s.',
      COALESCE(v_rep_name, 'The rep'),
      v_conversation.sales_target_count,
      v_bonus_euro
    ),
    'sales_milestone',
    jsonb_build_object(
      'target_count', v_conversation.sales_target_count,
      'bonus_cents', v_conversation.sales_target_bonus_cents,
      'deal_ids', to_jsonb(v_deal_ids)
    )
  );

  UPDATE public.conversations
  SET sales_target_milestone_pending = true,
      updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_sales_milestone_message ON public.sales_deals;
CREATE TRIGGER trg_post_sales_milestone_message
  AFTER INSERT OR UPDATE OF stage ON public.sales_deals
  FOR EACH ROW
  EXECUTE FUNCTION public.post_sales_milestone_message();

-- ── Trigger function 2: advance the cycle when a milestone pays ────
CREATE OR REPLACE FUNCTION public.handle_milestone_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_count int;
BEGIN
  -- Only act on the awaiting/paid → transferred transition for rows
  -- explicitly marked as milestone payments. Regular Vano Pay payouts
  -- and per-deal sales bonuses are handled by other paths.
  IF NEW.status IS DISTINCT FROM 'transferred' THEN
    RETURN NEW;
  END IF;
  IF OLD IS NOT NULL AND OLD.status = 'transferred' THEN
    RETURN NEW;
  END IF;
  IF NEW.is_sales_milestone_payment IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sales_target_count INTO v_target_count
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF v_target_count IS NULL THEN
    RETURN NEW;
  END IF;

  -- Advance the cycle: bump paid_count by the target so the next
  -- closed_won deal that takes us back to (count − paid) == target
  -- can fire a fresh milestone, and clear the pending flag.
  UPDATE public.conversations
  SET sales_target_paid_count = sales_target_paid_count + v_target_count,
      sales_target_milestone_pending = false,
      updated_at = now()
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_milestone_payout ON public.vano_payments;
CREATE TRIGGER trg_handle_milestone_payout
  AFTER UPDATE OF status ON public.vano_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_milestone_payout();
