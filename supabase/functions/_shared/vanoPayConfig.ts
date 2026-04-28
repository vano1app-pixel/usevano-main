// Single source of truth for Vano Pay economics. Imported by
// create-vano-payment-checkout (server-authoritative charge) and
// get-vano-pay-config (public endpoint the frontend preview calls).
// Changing any of these values means redeploying both functions;
// no frontend deploy is needed — the modal fetches the config live.
//
// Fee model: SPLIT 4% / 4%. Both sides pay 4% on the agreed price.
//   - Hirer is charged: agreed_price + 4% (so Stripe receives the
//     gross amount).
//   - Freelancer receives: agreed_price − 4% (the freelancer fee comes
//     out of their side at release time, like a marketplace cut).
//   - Vano keeps 8% of the agreed price total (4% from each side).
//
// On the vano_payments row that semantics maps to:
//   amount_cents = agreed_price_cents + hirer_fee_cents   (what hirer paid)
//   fee_cents    = hirer_fee_cents + freelancer_fee_cents (Vano's take)
//   payout       = amount_cents − fee_cents               (= agreed − freelancer_fee)
// Existing display code that does `amount − fee = freelancer payout`
// continues to work without change.

export const VANO_PAY_HIRER_FEE_BPS = 400;        // 4.00% added on top of agreed price
export const VANO_PAY_FREELANCER_FEE_BPS = 400;   // 4.00% deducted from agreed price

// Legacy single-side fee — used by the digital-sales bonus payout
// path only (BusinessDealsPanel.tsx → create-vano-payment-checkout
// with sales_deal_id set). Bonuses pre-date the split-fee model and
// the rep + business already have the bonus_amount_cents agreed in
// the deal record; treating it as the gross hirer charge minus a 3%
// platform fee preserves that behaviour and keeps the "Pay €X
// bonus" button in the panel honest. New (non-bonus) Vano Pay flows
// use the split 4%/4% model above.
export const VANO_PAY_LEGACY_FEE_BPS = 300;       // 3.00% taken from the gross (bonus flow only)
// Combined % of the AGREED price that Vano takes — handy for copy
// ("Vano keeps 8%"). Not the same as fee_cents / amount_cents because
// amount_cents is grossed-up; this is the reference figure both
// parties recognise from the chat.
export const VANO_PAY_TOTAL_FEE_BPS_OF_AGREED =
  VANO_PAY_HIRER_FEE_BPS + VANO_PAY_FREELANCER_FEE_BPS;

export const VANO_PAY_MIN_CENTS = 100;            // €1.00 — Stripe EUR minimum on the agreed price.
export const VANO_PAY_MAX_CENTS = 500000;         // €5,000 ceiling for MVP (applied to the agreed price).
export const VANO_PAY_CURRENCY = 'eur';

// Helper used by both the checkout function and the get-vano-pay-config
// endpoint so the math stays in one place. `agreedCents` is the price
// the freelancer quoted in chat (what the hirer types into the modal).
//   hirerFeeCents:        4% of agreed, floored at 1 cent.
//   freelancerFeeCents:   4% of agreed, floored at 1 cent.
//   amountCents:          agreed + hirerFee → what Stripe charges.
//   feeCents:             hirerFee + freelancerFee → Vano's total take.
//   freelancerCents:      agreed − freelancerFee → what lands in
//                          the freelancer's bank.
// The 1-cent floor mirrors the historic single-fee model so a sub-€1
// transaction still produces a positive Vano take. Real-world inputs
// are gated by VANO_PAY_MIN_CENTS = 100 so the floor only matters for
// rounding edges, not actual rounding-to-zero.
export function computeVanoPaySplit(agreedCents: number): {
  agreedCents: number;
  hirerFeeCents: number;
  freelancerFeeCents: number;
  amountCents: number;
  feeCents: number;
  freelancerCents: number;
} {
  const hirerFeeCents = Math.max(1, Math.round((agreedCents * VANO_PAY_HIRER_FEE_BPS) / 10000));
  const freelancerFeeCents = Math.max(1, Math.round((agreedCents * VANO_PAY_FREELANCER_FEE_BPS) / 10000));
  const amountCents = agreedCents + hirerFeeCents;
  const feeCents = hirerFeeCents + freelancerFeeCents;
  const freelancerCents = agreedCents - freelancerFeeCents;
  return {
    agreedCents,
    hirerFeeCents,
    freelancerFeeCents,
    amountCents,
    feeCents,
    freelancerCents,
  };
}

// Auto-release timing — how long Vano holds funds before sweeping
// them to the freelancer if the hirer never taps Release.
//
// Two modes:
//   1. No deadline supplied → flat 14 days from payment time. This is
//      the legacy behaviour and the safe default for hirers who don't
//      want to commit to a date.
//   2. Deadline supplied → release ~72 hours after the deadline so
//      the hirer has a review window AFTER the work is due, then
//      release. Clamped to:
//        FLOOR  = paidAt + 48h  (so a same-day deadline still gives
//                                 the hirer two days to review)
//        CEILING = paidAt + 30 days (escrow shouldn't sit forever)
//
// The hirer can always release earlier manually; this is only the
// "passive ghost" auto-fire timer.

export const VANO_PAY_AUTO_RELEASE_DEFAULT_MS = 14 * 24 * 60 * 60 * 1000;
export const VANO_PAY_AUTO_RELEASE_FLOOR_MS = 48 * 60 * 60 * 1000;
export const VANO_PAY_AUTO_RELEASE_CEILING_MS = 30 * 24 * 60 * 60 * 1000;
export const VANO_PAY_AUTO_RELEASE_GRACE_MS = 72 * 60 * 60 * 1000;

export function computeAutoReleaseMs(
  paidAtMs: number,
  deadlineAtMs: number | null,
): number {
  // No deadline → legacy 14-day flat hold.
  if (deadlineAtMs == null || !Number.isFinite(deadlineAtMs)) {
    return paidAtMs + VANO_PAY_AUTO_RELEASE_DEFAULT_MS;
  }
  // Deadline-aligned with grace, clamped to floor/ceiling so even
  // weird inputs (deadline in the past, deadline 6 months out) land
  // in a sensible window.
  const floor = paidAtMs + VANO_PAY_AUTO_RELEASE_FLOOR_MS;
  const ceiling = paidAtMs + VANO_PAY_AUTO_RELEASE_CEILING_MS;
  const target = deadlineAtMs + VANO_PAY_AUTO_RELEASE_GRACE_MS;
  return Math.min(ceiling, Math.max(floor, target));
}

