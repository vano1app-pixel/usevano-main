import { describe, it, expect } from 'vitest';
// The server module is pure TS, so vitest imports it DIRECTLY (same pattern
// as householdPayMath.test.ts → vanoFees) and pins the money-release contract.
import {
  resolveMoneyAction,
  isFarFuture,
  AUTH_MAX_LEAD_MS,
} from '../../../supabase/functions/_shared/bookingMoney';

// AUTH-AT-BOOKING money rule — the three Stripe artifact states must never be
// confused: captured money is refunded, an uncaptured hold is cancelled
// (Stripe cannot refund an uncaptured intent), an open session is expired.
describe('resolveMoneyAction', () => {
  it('refunds captured money (paid_at set + pi_)', () => {
    expect(resolveMoneyAction('2026-07-15T10:00:00Z', 'pi_abc123')).toBe('refund');
  });

  it('cancels an uncaptured hold (paid_at null + pi_)', () => {
    expect(resolveMoneyAction(null, 'pi_abc123')).toBe('cancel_pi');
    expect(resolveMoneyAction(undefined, 'pi_abc123')).toBe('cancel_pi');
  });

  it('expires an open checkout session (cs_), paid or not', () => {
    expect(resolveMoneyAction(null, 'cs_test_123')).toBe('expire_session');
    // paid_at with a cs_ id can only be a fee-free booking whose paid stamp
    // never came from this session — expiring the dead link is still right.
    expect(resolveMoneyAction('2026-07-15T10:00:00Z', 'cs_test_123')).toBe('expire_session');
  });

  it('does nothing when no Stripe artifact exists', () => {
    expect(resolveMoneyAction(null, null)).toBe('none');
    expect(resolveMoneyAction(null, undefined)).toBe('none');
    expect(resolveMoneyAction(null, '')).toBe('none');
    expect(resolveMoneyAction(null, '   ')).toBe('none');
    expect(resolveMoneyAction('2026-07-15T10:00:00Z', null)).toBe('none');
  });

  it('ignores unknown id shapes (never guesses)', () => {
    expect(resolveMoneyAction(null, 'ch_12345')).toBe('none');
    expect(resolveMoneyAction(null, 'sub_12345')).toBe('none');
  });
});

// Card auth holds die at ~7 days — bookings scheduled further out than the
// 5-day gate must keep the classic pay-after-accept flow.
describe('isFarFuture', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');

  it('ASAP (null) is never far-future', () => {
    expect(isFarFuture(null, now)).toBe(false);
    expect(isFarFuture(undefined, now)).toBe(false);
  });

  it('tomorrow is not far-future', () => {
    expect(isFarFuture('2026-07-16T09:00:00Z', now)).toBe(false);
  });

  it('exactly at the 5-day boundary is not far-future (strict >)', () => {
    expect(isFarFuture(new Date(now + AUTH_MAX_LEAD_MS).toISOString(), now)).toBe(false);
  });

  it('one minute past the boundary is far-future', () => {
    expect(isFarFuture(new Date(now + AUTH_MAX_LEAD_MS + 60_000).toISOString(), now)).toBe(true);
  });

  it('unparseable dates fail safe (not far-future → auth path, which is the safer default)', () => {
    expect(isFarFuture('Tomorrow 9am', now)).toBe(false);
  });

  it('the gate itself is 5 days', () => {
    expect(AUTH_MAX_LEAD_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });
});
