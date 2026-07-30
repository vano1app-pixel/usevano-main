// DIRECT-PAY MODEL (July 2026) — the single source of the Vano fee maths.
//
// Vano no longer holds the job money. The customer pays the STUDENT directly
// (Revolut / cash) and keeps 100% of the quoted job price with them; the ONLY
// thing Vano ever charges is its own booking fee (+ the optional Vano Cover
// add-on), taken by card when a helper accepts. No escrow, no payouts, no
// transfers — Vano is the introduction, the verification and the support,
// not the paymaster.
//
// Pure TypeScript, no Deno APIs — vitest imports this module directly and
// src/lib/householdPricing.ts mirrors the numbers for display; the contract
// test keeps the two in lock-step (same pattern as householdPricing.ts).

// Customer-side booking fee: 15% of the job price, floored at €5.
// Raised €4 → €5 (owner call 2026-07-30): Stripe's cut (~1.5% + €0.25) took
// ~€0.79 of every €4 fee, leaving ~€3.20 on a small job — less than it costs
// to support one. MUST mirror src/lib/householdPricing.ts; the contract test
// fails if they drift.
export const VANO_FEE_BPS = 1500;
export const VANO_FEE_MIN_CENTS = 500;

// Optional Vano Cover add-on (accidental damage up to €250) — flat €2,
// ticked by the customer at booking. Never called "insurance".
export const VANO_COVER_CENTS = 200;

// A customer phone with this many "didn't pay me" strikes from helpers is
// blocked at checkout until the owner clears it.
export const UNPAID_STRIKE_BLOCK_THRESHOLD = 2;

/** The Vano booking fee for a given job price (what the customer's card is
 *  charged at accept, before any fee discount). */
export function computeVanoFeeCents(jobPriceCents: number): number {
  if (!Number.isFinite(jobPriceCents) || jobPriceCents <= 0) return VANO_FEE_MIN_CENTS;
  return Math.max(VANO_FEE_MIN_CENTS, Math.round((jobPriceCents * VANO_FEE_BPS) / 10000));
}
