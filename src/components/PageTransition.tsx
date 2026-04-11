import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export type TransitionVariant = 'portal' | 'rise' | 'morph' | 'default';

const configs: Record<TransitionVariant, {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
  transition: Record<string, unknown>;
}> = {
  /* Landing ↔ Hire — zoom into a new world */
  portal: {
    initial: { opacity: 0, scale: 0.9, filter: 'blur(10px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit:    { opacity: 0, scale: 1.06, filter: 'blur(6px)' },
    transition: { type: 'spring', stiffness: 280, damping: 24, mass: 0.8 },
  },
  /* Auth → Onboarding → Profile — climb through chapters */
  rise: {
    initial: { opacity: 0, y: 80, rotateX: 3 },
    animate: { opacity: 1, y: 0, rotateX: 0 },
    exit:    { opacity: 0, y: -40 },
    transition: { type: 'spring', stiffness: 250, damping: 22 },
  },
  /* Browsing talent — quick, snappy, responsive */
  morph: {
    initial: { opacity: 0, scale: 0.96, filter: 'blur(3px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit:    { opacity: 0, scale: 0.98 },
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  },
  /* Everything else — clean, no drama */
  default: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
    transition: { duration: 0.2 },
  },
};

export function PageTransition({ children, variant = 'default' }: { children: ReactNode; variant?: TransitionVariant }) {
  const cfg = configs[variant];
  return (
    <motion.div
      initial={cfg.initial}
      animate={cfg.animate}
      exit={cfg.exit}
      transition={cfg.transition}
      style={{ willChange: 'transform, opacity, filter' }}
    >
      {children}
    </motion.div>
  );
}
