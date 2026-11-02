import { useSyncExternalStore } from 'react';

// Buyer ↔ Helper mode. ONE app, two audiences (owner call 2026-09-06: "mode
// switch in Account, not two apps"). The mode only decides which tab set the
// bottom bar shows and where "/" lands inside the native shell — it grants
// nothing. Helper screens still need the helper's own session.

export type AppMode = 'buyer' | 'helper';

const KEY = 'vano-mode';
const EVENT = 'vano:mode';

export function getMode(): AppMode {
  try {
    return localStorage.getItem(KEY) === 'helper' ? 'helper' : 'buyer';
  } catch {
    return 'buyer';
  }
}

export function setMode(mode: AppMode): void {
  try { localStorage.setItem(KEY, mode); } catch { /* private mode — fine */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useMode(): AppMode {
  return useSyncExternalStore(subscribe, getMode, () => 'buyer');
}

/** Routes that belong to the helper side of the app. */
export function isHelperRoute(pathname: string): boolean {
  return (
    pathname === '/find' ||
    pathname.startsWith('/student-') ||
    pathname === '/verify-helper' ||
    pathname === '/join'
  );
}
