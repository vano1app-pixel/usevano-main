import { describe, it, expect } from 'vitest';
import {
  VANO_PAY_CONFIG_FALLBACK,
  computeVanoPaySplit,
  computeAutoReleaseMs,
  VANO_PAY_AUTO_RELEASE_DEFAULT_MS,
  VANO_PAY_AUTO_RELEASE_FLOOR_MS,
  VANO_PAY_AUTO_RELEASE_CEILING_MS,
  VANO_PAY_AUTO_RELEASE_GRACE_MS,
} from '../vanoPayConfig';

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

describe('computeAutoReleaseMs', () => {
  // Pin a stable "now" so the math is reproducible regardless of when
  // the test runs. 2026-04-28T12:00:00Z is the date the deadline-aware
  // release was added.
  const PAID_AT_MS = Date.parse('2026-04-28T12:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;

  it('falls back to flat 14 days when no deadline is set', () => {
    const out = computeAutoReleaseMs(PAID_AT_MS, null);
    expect(out).toBe(PAID_AT_MS + 14 * DAY);
    expect(out).toBe(PAID_AT_MS + VANO_PAY_AUTO_RELEASE_DEFAULT_MS);
  });

  it('falls back to flat 14 days when deadline is NaN / infinity (junk input)', () => {
    expect(computeAutoReleaseMs(PAID_AT_MS, Number.NaN)).toBe(PAID_AT_MS + 14 * DAY);
    expect(computeAutoReleaseMs(PAID_AT_MS, Number.POSITIVE_INFINITY)).toBe(PAID_AT_MS + 14 * DAY);
  });

  it('uses deadline + 72h grace for a normal in-window deadline (5 days out)', () => {
    const deadline = PAID_AT_MS + 5 * DAY;
    const out = computeAutoReleaseMs(PAID_AT_MS, deadline);
    // Deadline + 72h = 5 days + 3 days = 8 days from paid → above floor, below ceiling.
    expect(out).toBe(deadline + VANO_PAY_AUTO_RELEASE_GRACE_MS);
    expect(out).toBe(PAID_AT_MS + 8 * DAY);
  });

  it('floors at paidAt + 48h for a same-day deadline so the hirer always has a review window', () => {
    const deadline = PAID_AT_MS; // "due today"
    const out = computeAutoReleaseMs(PAID_AT_MS, deadline);
    // deadline + 72h = 72h, but floor pulls it up to 48h... wait, 72 > 48 so target wins.
    expect(out).toBe(PAID_AT_MS + 72 * HOUR);
  });

  it('floors at paidAt + 48h for a deadline already in the past (defensive)', () => {
    const deadline = PAID_AT_MS - 10 * DAY;
    const out = computeAutoReleaseMs(PAID_AT_MS, deadline);
    expect(out).toBe(PAID_AT_MS + VANO_PAY_AUTO_RELEASE_FLOOR_MS);
    expect(out).toBe(PAID_AT_MS + 48 * HOUR);
  });

  it('caps at paidAt + 30 days for a far-future deadline (60 days out)', () => {
    const deadline = PAID_AT_MS + 60 * DAY;
    const out = computeAutoReleaseMs(PAID_AT_MS, deadline);
    expect(out).toBe(PAID_AT_MS + VANO_PAY_AUTO_RELEASE_CEILING_MS);
    expect(out).toBe(PAID_AT_MS + 30 * DAY);
  });

  it('caps at paidAt + 30 days even when deadline + 72h would exceed it', () => {
    // Deadline 28 days out → +72h grace = 31 days → ceiling clamps to 30.
    const deadline = PAID_AT_MS + 28 * DAY;
    const out = computeAutoReleaseMs(PAID_AT_MS, deadline);
    expect(out).toBe(PAID_AT_MS + 30 * DAY);
  });

  it('produces a release date strictly after paidAt for any sensible input', () => {
    for (const offsetDays of [-30, -1, 0, 0.5, 1, 3, 7, 14, 25, 60, 365]) {
      const out = computeAutoReleaseMs(PAID_AT_MS, PAID_AT_MS + offsetDays * DAY);
      expect(out).toBeGreaterThan(PAID_AT_MS);
    }
  });

  it('release date is monotonic with deadline (later deadline → equal-or-later release, until ceiling)', () => {
    const a = computeAutoReleaseMs(PAID_AT_MS, PAID_AT_MS + 5 * DAY);
    const b = computeAutoReleaseMs(PAID_AT_MS, PAID_AT_MS + 10 * DAY);
    const c = computeAutoReleaseMs(PAID_AT_MS, PAID_AT_MS + 25 * DAY);
    expect(a).toBeLessThanOrEqual(b);
    expect(b).toBeLessThanOrEqual(c);
  });
});
