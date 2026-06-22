import { useEffect, useState } from 'react';

/**
 * Count a number up from 0 to `target` once, on an ease-out curve. Shared by
 * the hero's live helper count and the dashboard's earnings totals so the two
 * never drift. Mounts the component that calls it to (re)trigger the count —
 * e.g. opening the Earnings tab replays it.
 */
export function useCountUp(target: number, duration = 700): number {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * ease));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
}
