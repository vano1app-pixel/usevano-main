import React from 'react';
import { useMorphLoader } from '@/hooks/useMorphTransition';
import { cn } from '@/lib/utils';

interface MorphLoaderProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Loading indicator that morphs between geometric shapes.
 * Replaces boring spinners with mesmerizing shape transitions.
 */
export const MorphLoader: React.FC<MorphLoaderProps> = ({
  size = 40,
  color = 'currentColor',
  className,
}) => {
  const { currentPath } = useMorphLoader({ cycleDuration: 800 });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('animate-[spin_4s_linear_infinite]', className)}
    >
      <path
        d={currentPath}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
