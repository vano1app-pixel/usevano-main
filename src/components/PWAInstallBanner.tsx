import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-banner-dismissed';
const DISMISS_DAYS = 30;

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isDismissed(): boolean {
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const dismissedAt = parseInt(dismissed, 10);
  return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export const PWAInstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // Capture the beforeinstallprompt event early (Chromium only)
  useEffect(() => {
    if (isStandaloneDisplay()) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Detect iOS
  useEffect(() => {
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
    setIsIOS(isiOS);
  }, []);

  // Show after login — listen for SIGNED_IN event
  useEffect(() => {
    if (isStandaloneDisplay()) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !isDismissed()) {
        // Small delay so the login transition settles first
        window.setTimeout(() => setShowModal(true), 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setShowModal(false);
        localStorage.setItem(DISMISS_KEY, Date.now().toString());
      }
      setDeferredPrompt(null);
    } else {
      // iOS or fallback — just dismiss since the browser handles it
      setShowModal(false);
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowModal(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  const canUseNativeInstall = Boolean(deferredPrompt) && !isIOS;

  return (
    <AnimatePresence>
      {showModal && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2500] bg-black/40 backdrop-blur-sm"
            onClick={handleDismiss}
          />

          {/* Modal */}
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="fixed inset-x-0 z-[2501] mx-auto max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px)+0.75rem)] md:top-1/2 md:-translate-y-1/2 w-[calc(100%-1.5rem)] max-w-sm"
          >
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              {/* Close button */}
              <button
                type="button"
                onClick={handleDismiss}
                className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Dismiss"
              >
                <X size={18} />
              </button>

              {/* Header with gradient */}
              <div className="relative bg-primary px-6 pb-6 pt-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-md">
                  <img
                    src="/pwa-192x192.png"
                    alt="VANO"
                    className="h-12 w-12 rounded-xl"
                  />
                </div>
                <h2 className="mt-4 text-lg font-bold text-white">Get the VANO App</h2>
                <p className="mt-1 text-sm text-white/70">
                  Faster, smoother, always one tap away
                </p>
              </div>

              {/* Features */}
              <div className="space-y-3 px-6 py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Smartphone size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Works like a real app</p>
                    <p className="text-xs text-muted-foreground">Full screen, no browser bar, instant launch</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Download size={16} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No app store needed</p>
                    <p className="text-xs text-muted-foreground">Installs in seconds, takes almost no space</p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-border px-6 py-4">
                {canUseNativeInstall ? (
                  <button
                    type="button"
                    onClick={handleInstall}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
                  >
                    Install Now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleInstall}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.98]"
                  >
                    Got it
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="mt-2 w-full rounded-xl py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
