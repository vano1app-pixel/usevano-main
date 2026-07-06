import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie } from 'lucide-react';

const STORAGE_KEY = 'cookie-consent-accepted';

/**
 * Informational cookie notice — we set essential cookies only (no tracking,
 * no ads), which need no consent under ePrivacy/GDPR, so this never has to
 * block anything. The old card covered the search dropdown, the price card's
 * Book button and the bottom nav at the exact moment a first-timer was trying
 * to book. Now it's a one-line pill that:
 *   • sits ABOVE the mobile bottom nav, never on top of it
 *   • stacks BELOW the booking sheet + backdrop (z-60 < z-69), so opening the
 *     sheet covers it instead of the other way round
 *   • acknowledges itself after 8s — informational notices don't need a tap
 */
export const CookieConsentBanner: React.FC = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setShow(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Auto-acknowledge: it's a notice, not a consent gate. Anyone who wants the
  // detail has the Privacy link; everyone else gets their screen back.
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => dismiss(), 8000);
    return () => clearTimeout(t);
  }, [show]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(STORAGE_KEY, Date.now().toString());
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ y: 16, opacity: 0, transition: { duration: 0.18, ease: 'easeOut' } }}
          /* Mobile: clears the 64px bottom nav + safe area. Desktop: bottom-left,
             out of the centred booking column. z-60 keeps it under the quick-book
             sheet (backdrop z-69 / sheet z-70). */
          className="pointer-events-auto fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom)_+_76px)] md:left-5 md:right-auto md:bottom-5 z-[60] flex justify-center md:justify-start"
        >
          <div className="flex items-center gap-2.5 rounded-full border border-border bg-card/95 py-2 pl-3 pr-2 shadow-lg shadow-black/10 backdrop-blur-md max-w-full">
            <Cookie size={15} className="shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />
            <p className="text-[11px] sm:text-xs text-muted-foreground truncate">
              Essential cookies, no tracking.{' '}
              <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Privacy
              </Link>
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/90 active:scale-[0.96]"
            >
              OK
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
