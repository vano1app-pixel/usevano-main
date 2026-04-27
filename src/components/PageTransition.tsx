import { type ReactNode } from 'react';

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
 */
export function PageTransition({ children }: { children: ReactNode; variant?: TransitionVariant }) {
  return <div className="animate-page-enter">{children}</div>;
}
