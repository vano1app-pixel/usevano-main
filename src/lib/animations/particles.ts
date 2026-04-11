/**
 * Particle burst configurations for tsparticles.
 * Each config can be triggered programmatically via the useParticleBurst hook.
 */
import type { ISourceOptions } from '@tsparticles/engine';

const baseEmitter = {
  life: { count: 1, duration: 0.1 },
  rate: { quantity: 0, delay: 0 },
};

/** Confetti burst — colourful squares/circles shooting outward */
export const confettiBurst: ISourceOptions = {
  fullScreen: false,
  particles: {
    number: { value: 0 },
    color: { value: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] },
    shape: { type: ['circle', 'square'] },
    size: { value: { min: 3, max: 7 } },
    life: { duration: { value: 2 }, count: 1 },
    move: {
      enable: true,
      speed: { min: 15, max: 35 },
      direction: 'none' as const,
      outModes: 'destroy' as const,
      gravity: { enable: true, acceleration: 12 },
    },
    opacity: { value: { min: 0.6, max: 1 }, animation: { enable: true, speed: 1, startValue: 'max' as const, destroy: 'min' as const } },
    rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } },
  },
  emitters: { ...baseEmitter, size: { width: 0, height: 0 }, position: { x: 50, y: 50 } },
};

/** Sparkle burst — small white/gold dots that twinkle outward */
export const sparkleBurst: ISourceOptions = {
  fullScreen: false,
  particles: {
    number: { value: 0 },
    color: { value: ['#ffffff', '#fbbf24', '#e2e8f0'] },
    shape: { type: 'circle' },
    size: { value: { min: 1, max: 4 } },
    life: { duration: { value: 1.5 }, count: 1 },
    move: {
      enable: true,
      speed: { min: 8, max: 20 },
      direction: 'none' as const,
      outModes: 'destroy' as const,
    },
    opacity: { value: { min: 0.4, max: 1 }, animation: { enable: true, speed: 2, startValue: 'max' as const, destroy: 'min' as const } },
    twinkle: { particles: { enable: true, frequency: 0.8, color: { value: '#fbbf24' } } },
  },
  emitters: { ...baseEmitter, size: { width: 0, height: 0 }, position: { x: 50, y: 50 } },
};

/** Firework burst — particles shoot up then explode */
export const fireworkBurst: ISourceOptions = {
  fullScreen: false,
  particles: {
    number: { value: 0 },
    color: { value: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'] },
    shape: { type: 'circle' },
    size: { value: { min: 2, max: 5 } },
    life: { duration: { value: 2.5 }, count: 1 },
    move: {
      enable: true,
      speed: { min: 20, max: 45 },
      direction: 'top' as const,
      outModes: 'destroy' as const,
      gravity: { enable: true, acceleration: 15 },
    },
    opacity: { value: 1, animation: { enable: true, speed: 0.5, startValue: 'max' as const, destroy: 'min' as const } },
  },
  emitters: { ...baseEmitter, size: { width: 5, height: 0 }, position: { x: 50, y: 100 } },
};

/** Interactive background — ambient floating particles that respond to mouse */
export const interactiveBackground: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 60,
  particles: {
    number: { value: 40, density: { enable: true } },
    color: { value: ['#3b82f6', '#10b981', '#8b5cf6'] },
    shape: { type: 'circle' },
    size: { value: { min: 1, max: 3 } },
    move: {
      enable: true,
      speed: 0.8,
      direction: 'none' as const,
      outModes: 'bounce' as const,
    },
    opacity: { value: { min: 0.1, max: 0.4 } },
    links: {
      enable: true,
      distance: 120,
      color: '#3b82f6',
      opacity: 0.08,
      width: 1,
    },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: 'grab' as const },
      onClick: { enable: true, mode: 'push' as const },
    },
    modes: {
      grab: { distance: 140, links: { opacity: 0.25 } },
      push: { quantity: 3 },
    },
  },
};

/** Vortex background — particles spiral toward center */
export const vortexBackground: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 60,
  particles: {
    number: { value: 60, density: { enable: true } },
    color: { value: ['#3b82f6', '#8b5cf6', '#ec4899'] },
    shape: { type: 'circle' },
    size: { value: { min: 1, max: 4 } },
    move: {
      enable: true,
      speed: 1.5,
      direction: 'none' as const,
      outModes: 'bounce' as const,
      trail: { enable: true, length: 5, fill: { color: 'transparent' } },
    },
    opacity: { value: { min: 0.15, max: 0.5 }, animation: { enable: true, speed: 0.5, sync: false } },
  },
  interactivity: {
    events: {
      onHover: { enable: true, mode: 'repulse' as const },
    },
    modes: {
      repulse: { distance: 100, speed: 1 },
    },
  },
};

export type ParticleBurstType = 'confetti' | 'sparkle' | 'firework';

export const burstConfigs: Record<ParticleBurstType, ISourceOptions> = {
  confetti: confettiBurst,
  sparkle: sparkleBurst,
  firework: fireworkBurst,
};
