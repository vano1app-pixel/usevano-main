import { useEffect, useRef, type RefObject } from 'react';
import { applyMagneticEffect } from '@/lib/animations/cursorEffects';

/**
 * Hook that applies a magnetic hover effect to a ref'd element.
 * The element subtly follows the cursor when hovered.
 *
 * Usage:
 *   const ref = useMagneticHover<HTMLButtonElement>({ strength: 0.4 });
 *   <button ref={ref}>Hover me</button>
 */
export function useMagneticHover<T extends HTMLElement>(
  options: { strength?: number; ease?: string; duration?: number } = {},
  externalRef?: RefObject<T | null>
): RefObject<T | null> {
  const internalRef = useRef<T | null>(null);
  const ref = externalRef || internalRef;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cleanup = applyMagneticEffect(el, options);
    return cleanup;
  }, [ref, options.strength, options.ease, options.duration]);

  return ref;
}
