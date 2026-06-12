import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getReferralCode } from '@/lib/referral';

const DISMISS_KEY = 'vano_referral_banner_dismissed';

function isDismissed(): boolean {
  try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

/** "Your friend gave you €5" — shown on the hero for visitors who arrived
 *  through a referral link. The actual validation happens server-side at
 *  checkout; this is just the promise, kept visible until they book. */
export const ReferralWelcomeBanner: React.FC = () => {
  const [visible, setVisible] = useState(() => !!getReferralCode() && !isDismissed());

  if (!visible) return null;

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    setVisible(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 rounded-2xl bg-gold/15 border border-gold/40 px-4 py-3 mb-6"
      role="status"
    >
      <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">🎁</span>
      <p className="flex-1 text-sm text-white/90 leading-snug">
        <span className="font-bold text-white">Your friend gave you €5</span> — it comes off
        your first booking automatically at checkout.
      </p>
      <button
        onClick={dismiss}
        className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5 text-white/70" />
      </button>
    </motion.div>
  );
};
