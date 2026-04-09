import React from 'react';
import { motion } from 'framer-motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  /** Delay in ms — useful for staggering siblings */
  delay?: number;
  className?: string;
}

/**
 * Wraps children in a fade-up reveal that triggers when scrolled into view.
 * Stagger cards by passing incrementing `delay` values (e.g. 0, 60, 120).
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({ children, delay = 0, className }) => (
  <motion.div
    initial={{ opacity: 0, y: 18 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-40px' }}
    transition={{
      duration: 0.5,
      delay: delay / 1000,
      ease: [0.23, 1, 0.32, 1],
    }}
    className={className}
  >
    {children}
  </motion.div>
);
