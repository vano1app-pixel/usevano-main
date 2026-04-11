import { useCallback, useRef } from 'react';
import { tsParticles } from '@tsparticles/engine';
import { burstConfigs, type ParticleBurstType } from '@/lib/animations/particles';

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < 768;

/**
 * Hook that returns a function to trigger a particle burst at given coordinates.
 * Automatically reduces particle count on mobile and respects prefers-reduced-motion.
 *
 * Usage:
 *   const burst = useParticleBurst();
 *   <button onClick={(e) => burst(e, 'confetti')}>Click me</button>
 */
export function useParticleBurst() {
  const counterRef = useRef(0);

  const trigger = useCallback(async (
    event: React.MouseEvent | { clientX: number; clientY: number },
    type: ParticleBurstType = 'confetti',
    options: { particleCount?: number } = {}
  ) => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const { clientX, clientY } = event;
    const mobile = isTouchDevice() || isMobileViewport();

    // Reduce particle count on mobile (40% of desktop)
    const desktopCount = options.particleCount ?? 30;
    const particleCount = mobile ? Math.max(5, Math.round(desktopCount * 0.4)) : desktopCount;

    // Create a temporary container at the click position
    const container = document.createElement('div');
    const id = `particle-burst-${Date.now()}-${counterRef.current++}`;
    container.id = id;
    Object.assign(container.style, {
      position: 'fixed',
      top: `${clientY - 100}px`,
      left: `${clientX - 100}px`,
      width: '200px',
      height: '200px',
      pointerEvents: 'none',
      zIndex: '10000',
    });
    document.body.appendChild(container);

    try {
      const config = structuredClone(burstConfigs[type]);

      // Override particle count
      if (config.emitters && !Array.isArray(config.emitters)) {
        config.emitters.rate = { quantity: particleCount, delay: 0 };
      }

      // Reduce particle sizes on mobile
      if (mobile && config.particles?.size) {
        const size = config.particles.size;
        if (typeof size.value === 'object' && 'max' in size.value) {
          size.value.max = Math.round(size.value.max * 0.7);
        }
      }

      const instance = await tsParticles.load({ id, options: config });

      // Auto-cleanup after particles die (shorter on mobile)
      setTimeout(() => {
        instance?.destroy();
        container.remove();
      }, mobile ? 2000 : 3000);
    } catch {
      container.remove();
    }
  }, []);

  return trigger;
}
