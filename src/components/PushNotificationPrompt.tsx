import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { hasUserActed } from '@/lib/userActivity';

export const PushNotificationPrompt: React.FC = () => {
  const { isSupported, isSubscribed, permission, loading, subscribe } = usePushNotifications();
  const [showPrompt, setShowPrompt] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupported || isSubscribed || permission === 'denied' || !user) return;
    // Don't pester first-time visitors — wait until they've actually used the
    // product (submitted a hire request or published a listing).
    if (!hasUserActed()) return;

    // Check if dismissed recently
    const dismissed = localStorage.getItem('push-prompt-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      if (Date.now() - dismissedAt < 3 * 24 * 60 * 60 * 1000) return; // 3 days
    }

    // Show after a delay
    const timer = setTimeout(() => setShowPrompt(true), 5000);
    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, permission, user]);

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('push-prompt-dismissed', Date.now().toString());
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-20 sm:top-24 left-3 right-3 sm:left-auto sm:right-4 sm:w-80 z-[2500]"
        >
          <div className="bg-card border border-border rounded-2xl p-4 shadow-xl shadow-black/10">
            <button
              onClick={handleDismiss}
              aria-label="Dismiss push-notification prompt"
              className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bell size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-sm font-semibold text-foreground">Never miss a gig</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Get notified instantly when new gigs matching your skills are posted.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDismiss}
                className="flex-1 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
              >
                Not now
              </button>
              <button
                onClick={handleEnable}
                disabled={loading}
                className="flex-1 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Enabling...' : 'Enable'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
