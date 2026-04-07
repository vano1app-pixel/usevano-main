import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X } from 'lucide-react';

const STORAGE_KEY = 'cookie-consent-accepted';

export const CookieConsentBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (accepted) return;
    const t = setTimeout(() => setShow(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const handleAccept = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="pointer-events-auto fixed top-20 sm:top-24 left-3 right-3 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 z-[2500]"
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

            <div className="flex items-start gap-3 pr-6">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Cookie size={18} className="text-primary" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Cookies</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  We use essential cookies to keep you signed in and make the site work.
                  No tracking or ads.{' '}
                  <Link to="/privacy" className="text-primary hover:underline underline-offset-2">
                    Privacy Policy
                  </Link>
                </p>
                <button
                  type="button"
                  onClick={handleAccept}
                  className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
