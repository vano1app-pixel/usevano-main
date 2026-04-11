import React, { useRef } from 'react';
import { useMagneticHover } from '@/hooks/useMagneticHover';
import { useParticleBurst } from '@/hooks/useParticleBurst';
import type { ParticleBurstType } from '@/lib/animations/particles';
import { cn } from '@/lib/utils';

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

  // Apply magnetic hover
  useMagneticHover({ strength: magneticStrength }, buttonRef);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (showBurst) {
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
