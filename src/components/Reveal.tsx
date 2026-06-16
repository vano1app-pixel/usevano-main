import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Fade-and-rise a block as it scrolls into view (once). The rise is a
 * transform, so the app's <MotionConfig reducedMotion="user"> drops it for
 * reduced-motion users — they still get the gentle fade.
 *
 * Don't wrap anything containing a position:fixed element: the settled
 * transform (translateY(0)) becomes its containing block and would re-anchor
 * it. Safe for the review / helper / FAQ sections (no fixed descendants).
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
