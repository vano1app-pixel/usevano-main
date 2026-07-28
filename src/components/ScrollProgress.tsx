import React, { useEffect, useState } from 'react';

/**
 * Thin progress bar at the top of the viewport showing scroll position.
 * Has a subtle particle-like gradient effect at the leading edge.
 */
export const ScrollProgress: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // No reduced-motion bail-out: the bar is scroll-position INFORMATION, not
    // decoration — reduced motion only drops the smoothing (see below).
    let raf: number;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (progress === 0) return null;

  // A calm, on-brand scroll indicator: a thin gold bar that simply grows with
  // scroll position. No looping shimmer, no glow dot, no off-brand blue/green —
  // those made it read as a perpetual "loading" bar that moved on its own.
  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-[9999] pointer-events-none">
      <div
        className="h-full w-full origin-left bg-gold motion-safe:transition-transform motion-safe:duration-100 motion-safe:ease-out"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
};
