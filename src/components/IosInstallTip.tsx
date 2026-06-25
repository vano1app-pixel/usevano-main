import { useEffect, useState } from 'react';
import { Share, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isNativeApp } from '@/lib/platform';

// A small, dismissible nudge shown ONLY on iOS Safari when the app isn't
// already installed (running standalone). iOS has no beforeinstallprompt, so
// the only way onto the home screen is the manual Share → "Add to Home Screen"
// flow — and a home-screen install is what makes web-push live updates reliable
// on iOS. Purely additive; never blocks anything. Dismissal is remembered.

const DISMISS_KEY = 'vano-ios-install-tip-dismissed';

function shouldShow(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  // Inside the native app the user already installed from the store — and
  // navigator.standalone is false in a Capacitor webview, so without this guard
  // we'd wrongly nag App Store users to "Add to Home Screen".
  if (isNativeApp()) return false;
  const ua = navigator.userAgent || '';
  const isIos = /iPhone|iPad|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  if (!isIos) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return false;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return false;
  try {
    if (localStorage.getItem(DISMISS_KEY)) return false;
  } catch { /* localStorage unavailable — still fine to show */ }
  return true;
}

export const IosInstallTip = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (shouldShow()) setShow(true);
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, Date.now().toString()); } catch { /* ignore */ }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] as const }}
          className="mt-4 flex items-start gap-3 rounded-2xl border border-border/60 bg-secondary/30 px-4 py-3"
        >
          <div className="w-9 h-9 rounded-full bg-sage/15 flex items-center justify-center flex-shrink-0">
            <Share size={16} className="text-sage" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-tight">Add VANO to your Home Screen</p>
            <p className="text-xs text-muted-foreground leading-snug mt-0.5">
              For live updates — tap the Share icon, then{' '}
              <span className="font-medium text-foreground">&quot;Add to Home Screen&quot;</span>.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 text-muted-foreground -mr-1"
          >
            <X size={15} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default IosInstallTip;
