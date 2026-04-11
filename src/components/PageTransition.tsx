import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createLiquidWipe } from '@/lib/animations/morphTransitions';

export type TransitionVariant = 'portal' | 'rise' | 'morph' | 'default' | 'liquid' | 'dissolve';

const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Framer Motion configs for standard transitions ── */
const configs: Record<string, {
  initial: Record<string, unknown>;
  animate: Record<string, unknown>;
  exit: Record<string, unknown>;
  transition: Record<string, unknown>;
}> = {
  portal: {
    initial: { opacity: 0, scale: isMobile ? 0.94 : 0.9, filter: isMobile ? 'blur(4px)' : 'blur(10px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit:    { opacity: 0, scale: isMobile ? 1.03 : 1.06, filter: isMobile ? 'blur(2px)' : 'blur(6px)' },
    transition: { type: 'spring', stiffness: 280, damping: isMobile ? 28 : 24, mass: 0.8 },
  },
  rise: {
    initial: { opacity: 0, y: isMobile ? 50 : 80, rotateX: isMobile ? 0 : 3 },
    animate: { opacity: 1, y: 0, rotateX: 0 },
    exit:    { opacity: 0, y: isMobile ? -20 : -40 },
    transition: { type: 'spring', stiffness: 250, damping: isMobile ? 26 : 22 },
  },
  morph: {
    initial: { opacity: 0, scale: 0.97 },
    animate: { opacity: 1, scale: 1 },
    exit:    { opacity: 0, scale: 0.98 },
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  default: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
    transition: { duration: 0.2 },
  },
  dissolve: {
    initial: { opacity: 0, filter: isMobile ? 'blur(4px)' : 'blur(12px)', scale: isMobile ? 0.97 : 0.95 },
    animate: { opacity: 1, filter: 'blur(0px)', scale: 1 },
    exit:    { opacity: 0, filter: isMobile ? 'blur(4px)' : 'blur(12px)', scale: isMobile ? 1.01 : 1.02 },
    transition: { duration: isMobile ? 0.35 : 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

/* ── Liquid Wipe Transition (SVG clip-path morph) ── */
function LiquidWipeTransition({ children }: { children: ReactNode }) {
  const svgRef = useRef<SVGPathElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (prefersReduced) {
      setRevealed(true);
      return;
    }

    const wipe = createLiquidWipe();
    let raf: number;
    let start: number;
    const duration = 700; // ms

    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);

      // Eased progress
      const eased = 1 - Math.pow(1 - progress, 3);

      if (svgRef.current) {
        svgRef.current.setAttribute('d', wipe(eased));
      }

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      } else {
        setRevealed(true);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="relative">
      {/* SVG clip-path mask */}
      {!revealed && (
        <svg
          className="fixed inset-0 pointer-events-none"
          style={{ zIndex: 9999, width: '100vw', height: '100vh' }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <clipPath id="liquid-wipe-clip" clipPathUnits="objectBoundingBox">
              <path
                ref={svgRef}
                d="M 0,100 C 25,100 50,100 75,100 C 100,100 100,100 100,100 L 100,100 L 0,100 Z"
                transform="scale(0.01)"
              />
            </clipPath>
          </defs>
          {/* Coloured wipe overlay */}
          <rect
            width="100"
            height="100"
            fill="hsl(221 83% 53% / 0.15)"
            style={{ clipPath: 'url(#liquid-wipe-clip)' }}
          />
        </svg>
      )}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{ willChange: 'opacity' }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function PageTransition({ children, variant = 'default' }: { children: ReactNode; variant?: TransitionVariant }) {
  // Liquid wipe gets its own component
  if (variant === 'liquid' && !prefersReduced) {
    return <LiquidWipeTransition>{children}</LiquidWipeTransition>;
  }

  // Fall back to 'default' for liquid when reduced motion is on
  const effectiveVariant = variant === 'liquid' ? 'default' : variant;
  const cfg = configs[effectiveVariant] || configs.default;

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
