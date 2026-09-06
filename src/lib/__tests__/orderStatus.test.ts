import { describe, it, expect } from 'vitest';
import { orderStatus, cancelRule } from '../orderStatus';

describe('orderStatus', () => {
  it('maps every booking status to one of four steps', () => {
    expect(orderStatus('pending').label).toBe('Looking for a helper');
    expect(orderStatus('accepted').label).toBe('Helper on the way');
    expect(orderStatus('on_way').step).toBe(2);
    expect(orderStatus('arrived').step).toBe(2);
    expect(orderStatus('in_progress').label).toBe('In progress');
    expect(orderStatus('completed')).toMatchObject({ step: 4, label: 'Done', done: true });
    expect(orderStatus('cancelled').done).toBe(true);
    expect(orderStatus('awaiting_payment').step).toBe(0);
  });

  it('states the cancel rule honestly', () => {
    expect(cancelRule('pending', 660).free).toBe(true);
    expect(cancelRule('accepted', 660)).toMatchObject({ free: false });
    expect(cancelRule('accepted', 660).text).toContain('€6.60');
  });
});
