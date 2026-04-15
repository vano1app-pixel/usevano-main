import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

export type TransitionVariant = 'portal' | 'rise' | 'morph' | 'default' | 'liquid' | 'dissolve';

/**
 * Simple page transition wrapper. The variant prop is accepted for backwards
 * compatibility with existing call sites but is intentionally ignored — every
 * page now uses the same short opacity fade.
 *
 * `exit` was intentionally dropped: App.tsx removed its <AnimatePresence>
 * wrapper after it raced React's reconciler and surfaced "removeChild" /
 * "insertBefore" errors. Without AnimatePresence, an `exit` prop just
 * registers a dead animation with Framer Motion's controls, and on fast
 * navigations those controls still reach into a DOM node React has already
 * unmounted — producing the `reading 'add'` / `reading 'remove'` cascade
 * we see in production. Enter-only is enough; there's no visible regression.
 */
export function PageTransition({ children }: { children: ReactNode; variant?: TransitionVariant }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
