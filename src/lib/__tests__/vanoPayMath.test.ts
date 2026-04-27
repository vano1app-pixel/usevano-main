import { describe, it, expect } from 'vitest';
import { VANO_PAY_CONFIG_FALLBACK, computeVanoPaySplit } from '../vanoPayConfig';

// Fee math is revenue. A bug here under/over-charges freelancers or
// hirers, and silently drifts from the server-authoritative calculation
// in supabase/functions/_shared/vanoPayConfig.ts (computeVanoPaySplit).
// The fallback config shipped to clients MUST match the server
// constants — if either drifts, the preview in VanoPayModal will show
// a different split than what Stripe actually charges.
//
// We assert the fallback constants here so any change to either side
// of the pair shows up in the diff as a broken test.
//
// Fee model: 4% hirer + 4% freelancer (split) on the AGREED PRICE.
//   - Hirer charged: agreed + 4% (this is the Stripe charge / amount_cents on the row)
//   - Freelancer receives: agreed − 4%
//   - Vano keeps: 8% of agreed (= hirer fee + freelancer fee)

describe('VANO_PAY_CONFIG_FALLBACK', () => {
  it('hirer side is 4% (400 basis points) — matches supabase/functions/_shared/vanoPayConfig.ts', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.hirerFeeBps).toBe(400);
  });

  it('freelancer side is 4% (400 basis points)', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.freelancerFeeBps).toBe(400);
  });

  it('total of agreed price is 8% (800 basis points)', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.totalFeeBpsOfAgreed).toBe(800);
  });

  it('total equals hirer + freelancer', () => {
    expect(VANO_PAY_CONFIG_FALLBACK.totalFeeBpsOfAgreed).toBe(
      VANO_PAY_CONFIG_FALLBACK.hirerFeeBps + VANO_PAY_CONFIG_FALLBACK.freelancerFeeBps,
    );
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

describe('computeVanoPaySplit', () => {
  const cfg = VANO_PAY_CONFIG_FALLBACK;

  it('on €100.00 agreed: hirer pays €104, freelancer gets €96, Vano keeps €8', () => {
    const split = computeVanoPaySplit(10000, cfg);
    expect(split.agreedCents).toBe(10000);
    expect(split.hirerFeeCents).toBe(400);
    expect(split.freelancerFeeCents).toBe(400);
    expect(split.amountCents).toBe(10400);
    expect(split.feeCents).toBe(800);
    expect(split.freelancerCents).toBe(9600);
  });

  it('on €1.00 agreed (minimum): hirer pays €1.04, freelancer gets €0.96, Vano keeps €0.08', () => {
    const split = computeVanoPaySplit(100, cfg);
    expect(split.hirerFeeCents).toBe(4);
    expect(split.freelancerFeeCents).toBe(4);
    expect(split.amountCents).toBe(104);
    expect(split.feeCents).toBe(8);
    expect(split.freelancerCents).toBe(96);
  });

  it('on €50.00 agreed: hirer pays €52, freelancer gets €48, Vano keeps €4', () => {
    const split = computeVanoPaySplit(5000, cfg);
    expect(split.amountCents).toBe(5200);
    expect(split.feeCents).toBe(400);
    expect(split.freelancerCents).toBe(4800);
  });

  it('on €5,000.00 agreed (max): hirer pays €5,200, freelancer gets €4,800, Vano keeps €400', () => {
    const split = computeVanoPaySplit(500000, cfg);
    expect(split.amountCents).toBe(520000);
    expect(split.feeCents).toBe(40000);
    expect(split.freelancerCents).toBe(480000);
  });

  it('rounds €10.33 × 4% per side correctly (€0.41 each → 41 + 41 = 82)', () => {
    const split = computeVanoPaySplit(1033, cfg);
    expect(split.hirerFeeCents).toBe(41);
    expect(split.freelancerFeeCents).toBe(41);
    expect(split.amountCents).toBe(1074);
    expect(split.feeCents).toBe(82);
    expect(split.freelancerCents).toBe(992);
  });

  it('preserves the display invariant: amount − fee = freelancer payout', () => {
    for (const agreed of [100, 250, 1000, 1233, 9999, 50000, 250000, 500000]) {
      const split = computeVanoPaySplit(agreed, cfg);
      expect(split.amountCents - split.feeCents).toBe(split.freelancerCents);
    }
  });

  it('keeps fee_cents / amount_cents under 20% so the release-vano-payment guard never trips', () => {
    // The release / auto-release functions reject fee_cents that
    // exceeds 20% of amount_cents as a corruption check. With a
    // 4%+4% split on a grossed-up amount, the ratio is
    // 8 / 108 ≈ 7.4% — well below 20%. This test is the canary that
    // catches anyone bumping the fee BPS too aggressively without
    // also raising that ceiling.
    for (const agreed of [100, 5000, 50000, 500000]) {
      const split = computeVanoPaySplit(agreed, cfg);
      expect(split.feeCents).toBeLessThan(Math.floor(split.amountCents * 0.2));
    }
  });

  it('returns zero fees on a zero-agreed input (preview no-op)', () => {
    const split = computeVanoPaySplit(0, cfg);
    expect(split.hirerFeeCents).toBe(0);
    expect(split.freelancerFeeCents).toBe(0);
    expect(split.amountCents).toBe(0);
    expect(split.feeCents).toBe(0);
    expect(split.freelancerCents).toBe(0);
  });
});
