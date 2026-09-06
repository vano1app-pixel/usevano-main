import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMode, setMode, isHelperRoute } from '../mode';

// A tiny in-memory localStorage — the lib test env has no window storage.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

describe('mode', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('window', { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  });

  it('defaults to buyer', () => {
    expect(getMode()).toBe('buyer');
  });

  it('remembers helper and anything else falls back to buyer', () => {
    setMode('helper');
    expect(getMode()).toBe('helper');
    localStorage.setItem('vano-mode', 'nonsense');
    expect(getMode()).toBe('buyer');
  });

  it('knows the helper routes', () => {
    expect(isHelperRoute('/find')).toBe(true);
    expect(isHelperRoute('/student-job/abc')).toBe(true);
    expect(isHelperRoute('/student-account')).toBe(true);
    expect(isHelperRoute('/home')).toBe(false);
    expect(isHelperRoute('/bookings')).toBe(false);
  });
});
