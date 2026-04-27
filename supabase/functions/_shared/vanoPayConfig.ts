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
