import React, { useCallback, useMemo } from 'react';
import Particles from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Engine } from '@tsparticles/engine';
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

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
  variant = 'interactive',
  className = '',
  mobileReduction = 0.4,
}) => {
  const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
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

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`} style={{ zIndex: 0 }}>
      <Particles
        id={`particles-bg-${variant}`}
        init={particlesInit}
        options={options}
        className="absolute inset-0"
      />
    </div>
  );
};
