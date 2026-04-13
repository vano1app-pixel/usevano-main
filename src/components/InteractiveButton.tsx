import React from 'react';
import type { ParticleBurstType } from '@/lib/animations/particles';
import { cn } from '@/lib/utils';

interface InteractiveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @deprecated Retained for backwards compatibility. No longer triggers a particle burst. */
  burstType?: ParticleBurstType;
  /** @deprecated Retained for backwards compatibility. No longer triggers a particle burst. */
  particleCount?: number;
  /** @deprecated Retained for backwards compatibility. Magnetic hover has been removed. */
  magneticStrength?: number;
  /** @deprecated Retained for backwards compatibility. No longer triggers a particle burst. */
  showBurst?: boolean;
  children: React.ReactNode;
}

/**
 * Plain button that accepts the legacy InteractiveButton props so existing call
 * sites keep compiling. The decorative particle burst and magnetic-hover
 * effects were removed — this is now a straightforward button.
 */
export const InteractiveButton: React.FC<InteractiveButtonProps> = ({
  burstType: _burstType,
  particleCount: _particleCount,
  magneticStrength: _magneticStrength,
  showBurst: _showBurst,
  children,
  className,
  ...props
}) => {
  return (
    <button className={cn('relative', className)} {...props}>
      {children}
    </button>
  );
};
