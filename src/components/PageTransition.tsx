import { useState, type ReactNode } from 'react';

export type TransitionVariant = 'portal' | 'rise' | 'morph' | 'default' | 'liquid' | 'dissolve';

/**
 * Simple page enter-fade. The variant prop is accepted for backwards
 * compatibility with existing call sites but is intentionally ignored —
 * every page now uses the same short opacity fade.
 *
 * Implementation note: this used to wrap children in `motion.div` from
 * framer-motion. PageTransition is rendered on every route from App.tsx,
 * so importing framer-motion here pulled the entire `animation` chunk
 * (~80KB gzipped) onto the critical path for first paint — even on the
 * Landing page which uses no other framer-motion. Switching to a CSS-only
 * fade keeps the visual identical and lets framer-motion stay in the
 * lazy chunks (HirePage, BusinessDashboard, BlogPost, the deferred
 * floating banners) where it's actually needed.
 *
 * `exit` was previously dropped because AnimatePresence + the reconciler
 * raced and surfaced "removeChild" errors. Enter-only is enough.
 *
 * The class MUST come off once the animation finishes: `animation … both`
 * retains the final keyframe's `transform: translateY(0)` forever, and any
 * non-none transform turns this wrapper into the containing block for every
 * `position:fixed` descendant — the site nav, the job screen's SOS header,
 * TrackBooking's bottom panel all silently became page-absolute and scrolled
 * away with the content. Dropping the class after animationend releases them
 * back to the viewport. (If animationend never fires we just keep today's
 * behaviour — strictly no worse.)
 */
export function PageTransition({ children }: { children: ReactNode; variant?: TransitionVariant }) {
  const [settled, setSettled] = useState(false);
  return (
    <div
      className={settled ? undefined : 'animate-page-enter'}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setSettled(true);
      }}
    >
      {children}
    </div>
  );
}
