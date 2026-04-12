import { useCallback, useRef } from 'react';
import { burstConfigs, type ParticleBurstType } from '@/lib/animations/particles';

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

const isMobileViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < 768;

/** Lazy-init the tsparticles engine once */
let engineReady = false;
let engineLoading: Promise<void> | null = null;

async function ensureEngine() {
  if (engineReady) return;
  if (engineLoading) { await engineLoading; return; }
  engineLoading = (async () => {
    try {
      const { tsParticles } = await import('@tsparticles/engine');
      const { loadSlim } = await import('@tsparticles/slim');
      await loadSlim(tsParticles);
      engineReady = true;
    } catch {
      // tsparticles failed to load — silently disable particle bursts
    }
  })();
  await engineLoading;
}

/**
 * Hook that returns a function to trigger a particle burst at given coordinates.
 * Automatically reduces particle count on mobile and respects prefers-reduced-motion.
 * Lazy-loads tsparticles engine on first use.
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
    const desktopCount = options.particleCount ?? 30;
    const particleCount = mobile ? Math.max(5, Math.round(desktopCount * 0.4)) : desktopCount;

    // Lazy-init engine
    await ensureEngine();
    if (!engineReady) return;

    const { tsParticles } = await import('@tsparticles/engine');

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

      if (config.emitters && !Array.isArray(config.emitters)) {
        config.emitters.rate = { quantity: particleCount, delay: 0 };
      }

      if (mobile && config.particles?.size) {
        const size = config.particles.size;
        if (typeof size.value === 'object' && 'max' in size.value) {
          size.value.max = Math.round(size.value.max * 0.7);
        }
      }

      const instance = await tsParticles.load({ id, options: config });

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
