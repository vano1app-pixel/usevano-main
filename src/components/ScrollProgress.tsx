import React, { useEffect, useState } from 'react';

/**
 * Thin progress bar at the top of the viewport showing scroll position.
 * Has a subtle particle-like gradient effect at the leading edge.
 */
export const ScrollProgress: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

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

  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-[9999] pointer-events-none">
      <div
        className="h-full transition-[width] duration-75 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, hsl(221 83% 53%), hsl(142 76% 36%), hsl(221 83% 53%))',
          backgroundSize: '200% 100%',
          animation: 'shimmer 2s linear infinite',
          boxShadow: '0 0 8px hsl(221 83% 53% / 0.4), 0 0 20px hsl(221 83% 53% / 0.2)',
        }}
      />
      {/* Glowing dot at the leading edge */}
      <div
        className="absolute top-0 h-[2px] w-3 transition-[left] duration-75 ease-out"
        style={{
          left: `${progress}%`,
          background: 'radial-gradient(circle, hsl(221 83% 63%) 0%, transparent 70%)',
          filter: 'blur(1px)',
          boxShadow: '0 0 6px 2px hsl(221 83% 53% / 0.5)',
        }}
      />
    </div>
  );
};
