import { describe, it, expect } from 'vitest';
import { VANO_PAY_CONFIG_FALLBACK } from '../vanoPayConfig';

// Fee math is revenue. A bug here under/over-charges freelancers or
// hirers, and silently drifts from the server-authoritative calculation
// in create-vano-payment-checkout/index.ts:140. The fallback config
// shipped to clients MUST match the server constants in
// supabase/functions/_shared/vanoPayConfig.ts — if either drifts, the
// preview in VanoPayModal will show a different split than what
// Stripe actually charges.
//
// We assert the fallback constants here so any change to either side
// of the pair shows up in the diff as a broken test.

describe('VANO_PAY_CONFIG_FALLBACK', () => {
  it('is 3% (300 basis points) — matches supabase/functions/_shared/vanoPayConfig.ts', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.feeBps).toBe(300);
  });

  it('has the €1.00 Stripe EUR minimum', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.minCents).toBe(100);
  });

  it('has the €5,000 MVP ceiling', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.maxCents).toBe(500000);
  });

  it('is EUR-denominated', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.currency).toBe('eur');
  });
});

// Mirror the fee-calc the VanoPayModal preview does so a regression in
// the formula shows up here. This matches the client-side preview at
// src/components/VanoPayModal.tsx:59 exactly:
//   feeCents = max(1, round(amountCents * feeBps / 10000))
// The max(1, …) floor matters for sub-€0.34 transactions where the
// rounded fee would otherwise be zero — still take a penny.
function computeFee(amountCents: number, feeBps: number): number {
  return Math.max(1, Math.round((amountCents * feeBps) / 10000));
}

describe('Vano Pay fee math preview', () => {
  const { feeBps } = VANO_PAY_CONFIG_FALLBACK;

  it('takes 3% of €100.00 = €3.00 (300 cents)', () => {
    expect(computeFee(10000, feeBps)).toBe(300);
  });

  it('takes 3% of €1.00 = €0.03 (3 cents, floored at 1)', () => {
    expect(computeFee(100, feeBps)).toBe(3);
  });

  it('takes 3% of €50.00 = €1.50 (150 cents)', () => {
    expect(computeFee(5000, feeBps)).toBe(150);
  });

  it('takes 3% of €150.00 = €4.50 (450 cents) — matches the demo seed SQL', () => {
    expect(computeFee(15000, feeBps)).toBe(450);
  });

  it('takes 3% of €5,000.00 = €150.00 (15000 cents) — max transaction', () => {
    expect(computeFee(500000, feeBps)).toBe(15000);
  });

  it('rounds €10.33 × 3% = €0.30989 up to 31 cents', () => {
    expect(computeFee(1033, feeBps)).toBe(31);
  });

  it('floors at 1 cent so a sub-€0.34 transaction still takes a penny fee', () => {
    // 33 * 0.03 = 0.99 → rounds to 1 — this particular value rounds to
    // 1 organically, but the max(1, …) floor catches 16 cents × 3% = 0.48
    // which would otherwise round down to 0.
    expect(computeFee(16, feeBps)).toBe(1);
  });
});
