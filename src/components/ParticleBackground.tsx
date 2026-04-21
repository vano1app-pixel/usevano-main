import React, { useEffect, useMemo, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { interactiveBackground, vortexBackground } from '@/lib/animations/particles';

type ParticleVariant = 'interactive' | 'vortex';

interface ParticleBackgroundProps {
  variant?: ParticleVariant;
  className?: string;
  /** Reduce particle count on mobile */
  mobileReduction?: number;
}

const variantConfigs: Record<ParticleVariant, typeof interactiveBackground> = {
  interactive: interactiveBackground,
  vortex: vortexBackground,
};

// Engine init is a one-time setup under @tsparticles/react v3 —
// initParticlesEngine runs once, then every <Particles> mount is
// a plain render. We memo the promise at module scope so multiple
// ParticleBackground mounts on the same page share one init.
let engineReady: Promise<void> | null = null;
function ensureParticlesEngine(): Promise<void> {
  if (!engineReady) {
    engineReady = initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
  }
  return engineReady;
}

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
  variant = 'interactive',
  className = '',
  mobileReduction = 0.4,
}) => {
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureParticlesEngine().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const options = useMemo(() => {
    const config = structuredClone(variantConfigs[variant]);
    // Reduce particles on mobile
    if (typeof window !== 'undefined' && window.innerWidth < 768 && config.particles?.number) {
      const num = config.particles.number;
      if (typeof num.value === 'number') {
        num.value = Math.round(num.value * mobileReduction);
      }
    }
    return config;
  }, [variant, mobileReduction]);

  if (prefersReduced) return null;
  if (!ready) return null;

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} style={{ zIndex: 0 }}>
      <Particles
        id={`particles-bg-${variant}`}
        options={options}
        className="absolute inset-0"
      />
    </div>
  );
};
