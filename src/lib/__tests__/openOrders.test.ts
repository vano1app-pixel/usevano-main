import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { findOpenOrders, claimOrder, formatEuro, formatKm } from '../openOrders';

describe('openOrders', () => {
  beforeEach(() => invoke.mockReset());

  it('sends the query and returns orders', async () => {
    invoke.mockResolvedValue({ data: { orders: [{ id: 'a' }], radius_km: 5, eligible: true, helper: null }, error: null });
    const r = await findOpenOrders({ lat: 53.27, lng: -9.05, q: 'clean' });
    expect(invoke).toHaveBeenCalledWith('find-open-orders', { body: { lat: 53.27, lng: -9.05, q: 'clean' } });
    expect(r.orders).toHaveLength(1);
  });

  it('never returns a non-array orders field', async () => {
    invoke.mockResolvedValue({ data: { radius_km: 5, eligible: false, helper: null }, error: null });
    expect((await findOpenOrders({})).orders).toEqual([]);
  });

  it('claim returns the server status', async () => {
    invoke.mockResolvedValue({ data: { status: 'taken' }, error: null });
    expect((await claimOrder('b1')).status).toBe('taken');
    expect(invoke).toHaveBeenCalledWith('claim-order', { body: { booking_id: 'b1' } });
  });

  it('formats money and distance the way the cards show them', () => {
    expect(formatEuro(4400)).toBe('€44');
    expect(formatEuro(4450)).toBe('€44.50');
    expect(formatKm(0.4)).toBe('400 m');
    expect(formatKm(2.34)).toBe('2.3 km');
    expect(formatKm(null)).toBeNull();
  });
});
