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

// Customer-side booking fee: 15% of the job price, floored at €4.
export const VANO_FEE_BPS = 1500;
export const VANO_FEE_MIN_CENTS = 400;

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
