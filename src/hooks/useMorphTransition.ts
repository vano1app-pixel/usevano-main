import { useEffect, useRef, useState, type RefObject } from 'react';
import { createShapeCycle, loaderShapes } from '@/lib/animations/morphTransitions';

/**
 * Hook for morphing SVG path animations — cycles through shapes continuously.
 * Useful for loading indicators that morph between geometric shapes.
 *
 * Usage:
 *   const { pathRef, currentPath } = useMorphLoader();
 *   <svg><path ref={pathRef} d={currentPath} /></svg>
 */
export function useMorphLoader(options: {
  shapes?: string[];
  cycleDuration?: number;
  autoStart?: boolean;
} = {}) {
  const {
    shapes = [loaderShapes.circle, loaderShapes.square, loaderShapes.triangle, loaderShapes.diamond],
    cycleDuration = 800,
    autoStart = true,
  } = options;

  const pathRef = useRef<SVGPathElement | null>(null);
  const [currentPath, setCurrentPath] = useState(shapes[0]);
  const [isRunning, setIsRunning] = useState(autoStart);

  useEffect(() => {
    if (!isRunning) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const morphers = createShapeCycle(shapes);
    let shapeIndex = 0;
    let progress = 0;
    let lastTime = performance.now();
    let raf: number;

    const animate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      progress += delta / cycleDuration;

      if (progress >= 1) {
        progress = 0;
        shapeIndex = (shapeIndex + 1) % morphers.length;
      }

      const path = morphers[shapeIndex](progress);
      setCurrentPath(path);

      if (pathRef.current) {
        pathRef.current.setAttribute('d', path);
      }

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [isRunning, shapes, cycleDuration]);

  return { pathRef, currentPath, isRunning, setIsRunning };
}
