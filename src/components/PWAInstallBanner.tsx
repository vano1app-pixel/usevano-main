import React, { useState, useEffect } from 'react';
import { X, Download, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [iosReady, setIosReady] = useState(false);

  useEffect(() => {
    if (isStandaloneDisplay()) return;

    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }

    const ua = navigator.userAgent;
    const isiOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isiOSDevice);

    // iOS Safari: no beforeinstallprompt — show Add to Home Screen hint after a short delay
    if (isiOSDevice) {
      const timer = window.setTimeout(() => setIosReady(true), 2000);
      return () => window.clearTimeout(timer);
    }

    // Chromium (Chrome, Edge, Android, desktop): deferred install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      window.setTimeout(() => setShowBanner(true), 800);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // iOS path: show when ready; Chromium path: show when we got the event (handled in listener)
  useEffect(() => {
    if (isStandaloneDisplay()) return;
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;
    }
    if (isIOS && iosReady) setShowBanner(true);
  }, [isIOS, iosReady]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-banner-dismissed', Date.now().toString());
  };

  const canUseNativeInstall = Boolean(deferredPrompt) && !isIOS;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="pointer-events-auto fixed left-3 right-3 z-[2500] max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:left-1/2 md:right-auto md:w-full md:max-w-md md:-translate-x-1/2"
        >
          <div className="relative rounded-2xl border border-border bg-card/95 p-4 shadow-lg shadow-black/10 backdrop-blur-md">
              <button
                type="button"
                onClick={handleDismiss}
                className="absolute right-3 top-3 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>

              <div className="flex items-start gap-3 pr-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  {isIOS ? <Share size={20} className="text-primary" /> : <Download size={20} className="text-primary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Install VANO App</p>
                  {isIOS ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tap{' '}
                      <Share size={12} className="inline -mt-0.5 align-middle" /> then{' '}
                      <span className="font-medium text-foreground">&quot;Add to Home Screen&quot;</span> to install.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Add VANO to your home screen or desktop for quick access and an app-like experience.
                    </p>
                  )}
                </div>
              </div>

              {canUseNativeInstall && (
                <button
                  type="button"
                  onClick={handleInstall}
                  className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Install VANO App
                </button>
              )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
