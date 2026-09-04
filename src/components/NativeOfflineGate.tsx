import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { isNativeApp } from '@/lib/platform';

/**
 * Guideline 4.2 / 2.1: a native app that shows a raw WKWebView error page when
 * offline reads as "a website in a wrapper" and gets rejected. This paints a
 * branded full-screen offline state WITH a retry, but ONLY inside the native
 * shell — the web keeps its browser's own offline UX, and a website must never
 * hide itself behind this.
 *
 * A standalone overlay (like the app's other banners): it shows only while the
 * OS reports offline and clears the instant connectivity returns or Retry finds
 * it back. Cached content stays underneath, so it never traps a live session.
 */
export const NativeOfflineGate: React.FC = () => {
  const native = isNativeApp();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!native) return;
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [native]);

  if (!native || !offline) return null;

  const retry = () => setOffline(!navigator.onLine);

  return (
    <div
      role="alertdialog"
      aria-label="No internet connection"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-cream px-8 text-center"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span className="grid h-16 w-16 place-items-center rounded-full bg-navy/5" aria-hidden="true">
        <WifiOff className="h-7 w-7 text-navy/70" strokeWidth={2} />
      </span>
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">You’re offline</h1>
        <p className="mx-auto mt-2 max-w-[18rem] text-[15px] leading-relaxed text-muted-foreground">
          VANO needs a connection to find you a student. Check your Wi-Fi or mobile data and try again.
        </p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 text-[15px] font-semibold text-primary-foreground shadow-primary-glow transition-[background-color] duration-150 hover:bg-sage-dark active:scale-[0.98]"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
};
