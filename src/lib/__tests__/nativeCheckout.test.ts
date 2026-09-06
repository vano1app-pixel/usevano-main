import { describe, it, expect } from 'vitest';
import { waitForHold } from '../nativeCheckout';

describe('waitForHold', () => {
  it('resolves secured once the booking leaves awaiting_payment', async () => {
    const seq = ['awaiting_payment', 'awaiting_payment', 'pending'];
    const r = await waitForHold({ readStatus: async () => seq.shift() ?? 'pending', intervalMs: 1 });
    expect(r).toBe('secured');
    expect(seq).toEqual([]);
  });

  it('keeps polling through a null read', async () => {
    const seq: (string | null)[] = [null, 'accepted'];
    expect(await waitForHold({ readStatus: async () => seq.shift() ?? null, intervalMs: 1 })).toBe('secured');
  });

  it('times out honestly', async () => {
    expect(await waitForHold({ readStatus: async () => 'awaiting_payment', intervalMs: 1, timeoutMs: 5 })).toBe('timeout');
  });

  it('stops when cancelled', async () => {
    const signal = { cancelled: true };
    expect(await waitForHold({ readStatus: async () => 'awaiting_payment', intervalMs: 1 }, signal)).toBe('cancelled');
  });
});
