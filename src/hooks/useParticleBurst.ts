import { useCallback, useRef } from 'react';
import { tsParticles } from '@tsparticles/engine';
import { burstConfigs, type ParticleBurstType } from '@/lib/animations/particles';

/**
 * Hook that returns a function to trigger a particle burst at given coordinates.
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
    const { particleCount = 30 } = options;

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

      const instance = await tsParticles.load({ id, options: config });

      // Auto-cleanup after particles die
      setTimeout(() => {
        instance?.destroy();
        container.remove();
      }, 3000);
    } catch {
      container.remove();
    }
  }, []);

  return trigger;
}
