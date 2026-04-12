import React, { useRef } from 'react';
import { useMagneticHover } from '@/hooks/useMagneticHover';
import { useParticleBurst } from '@/hooks/useParticleBurst';
import type { ParticleBurstType } from '@/lib/animations/particles';
import { cn } from '@/lib/utils';

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

interface InteractiveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Particle burst type on click */
  burstType?: ParticleBurstType;
  /** Number of particles to emit */
  particleCount?: number;
  /** Magnetic hover strength (0 = disabled) */
  magneticStrength?: number;
  /** Whether to show particle burst on click */
  showBurst?: boolean;
  children: React.ReactNode;
}

/**
 * Button with built-in particle burst on click + magnetic hover.
 * Drop-in replacement for any <button> element.
 *
 * Mobile: magnetic hover is auto-disabled (no-op on touch).
 * Particle burst auto-reduces count on mobile via useParticleBurst.
 */
export const InteractiveButton: React.FC<InteractiveButtonProps> = ({
  burstType = 'sparkle',
  particleCount = 20,
  magneticStrength = 0.3,
  showBurst = true,
  children,
  className,
  onClick,
  ...props
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const burst = useParticleBurst();
  const isTouch = isTouchDevice();

  // Apply magnetic hover (auto no-op on touch devices via cursorEffects.ts)
  useMagneticHover({ strength: isTouch ? 0 : magneticStrength }, buttonRef);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (showBurst) {
      // useParticleBurst auto-reduces on mobile
      burst(e, burstType, { particleCount });
    }
    onClick?.(e);
  };

  return (
    <button
      ref={buttonRef}
      className={cn('relative', className)}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
};
