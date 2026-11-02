import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyOtp = vi.fn();
const getSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { verifyOtp: (...a: unknown[]) => verifyOtp(...a), getSession: () => getSession() } } }));

import { adoptHelperSession, hasSupabaseSession } from '../helperSession';

describe('helperSession', () => {
  beforeEach(() => { verifyOtp.mockReset(); getSession.mockReset(); });

  it('adopts a minted magic-link token', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    expect(await adoptHelperSession({ token_hash: 'abc', type: 'magiclink' })).toBe(true);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'magiclink' });
  });

  it('is fail-soft on a missing or rejected token', async () => {
    expect(await adoptHelperSession(null)).toBe(false);
    verifyOtp.mockResolvedValue({ error: { message: 'expired' } });
    expect(await adoptHelperSession({ token_hash: 'x', type: 'magiclink' })).toBe(false);
  });

  it('reports whether a session exists', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
    expect(await hasSupabaseSession()).toBe(true);
    getSession.mockResolvedValue({ data: { session: null } });
    expect(await hasSupabaseSession()).toBe(false);
  });
});
