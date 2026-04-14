import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

export type TransitionVariant = 'portal' | 'rise' | 'morph' | 'default' | 'liquid' | 'dissolve';

/**
 * Simple page transition wrapper. The variant prop is accepted for backwards
 * compatibility with existing call sites but is intentionally ignored — every
 * page now uses the same short opacity fade.
 */
export function PageTransition({ children }: { children: ReactNode; variant?: TransitionVariant }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
