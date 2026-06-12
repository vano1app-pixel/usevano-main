import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

interface BottomSheetProps {
  onClose: () => void;
  /** Accessible dialog label. */
  label: string;
  children: React.ReactNode;
}

/**
 * The slide-up sheet shared by the booking flows: tap a button and it slides
 * up from the bottom of the screen. Render it inside an <AnimatePresence> so
 * the exit slide plays. Handles the backdrop, body scroll-lock (without losing
 * scroll position), Escape-to-close and the drag handle — callers supply the
 * contents. Centred at a comfortable width on desktop, full-width on mobile.
 */
export const BottomSheet: React.FC<BottomSheetProps> = ({ onClose, label, children }) => {
  // Lock body scroll while open, restoring the exact scroll position on close
  useEffect(() => {
    const scrollY = window.scrollY;
    const { style } = document.body;
    const prev = { overflow: style.overflow, position: style.position, top: style.top, width: style.width };
    style.overflow = 'hidden';
    style.position = 'fixed';
    style.top = `-${scrollY}px`;
    style.width = '100%';
    return () => {
      style.overflow = prev.overflow;
      style.position = prev.position;
      style.top = prev.top;
      style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Escape closes
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[69] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet — iOS drawer curve. The enter is deliberate enough to read as a
          slide (too fast and it reads as a "pop"); the exit snaps back quicker. */}
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%', transition: { duration: 0.3, ease: [0.32, 0.72, 0, 1] } }}
        transition={{ duration: 0.44, ease: [0.32, 0.72, 0, 1] }}
        className="fixed inset-x-0 bottom-0 z-[70] mx-auto w-full sm:max-w-md bg-cream rounded-t-3xl shadow-2xl safe-area-bottom"
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-foreground/15" />
        </div>
        {children}
      </motion.div>
    </>
  );
};
