import { useEffect, useRef, useState } from 'react';

/**
 * Native-app pull-to-refresh for touch devices: pull down from the very top
 * of the page past the threshold, release, `onRefresh` runs. Returns the
 * rubber-banded pull distance (px) and whether a refresh is in flight so the
 * caller can render a spinner. Mouse/desktop is untouched.
 *
 * While mounted it sets `overscroll-behavior-y: contain` on <html> so
 * Chrome-on-Android's built-in pull-to-reload doesn't swallow the gesture;
 * restored on unmount.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown> | unknown, threshold = 60) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const busy = useRef(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;

  useEffect(() => {
    const html = document.documentElement;
    const prevOverscroll = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'contain';

    const setP = (v: number) => { pullRef.current = v; setPull(v); };
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 && !busy.current ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) { if (pullRef.current) setP(0); return; }
      setP(Math.min(110, dy * 0.45)); // rubber-band: half-speed, capped
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (pullRef.current >= threshold) {
        busy.current = true;
        setRefreshing(true);
        Promise.resolve(cb.current()).finally(() => {
          busy.current = false;
          setRefreshing(false);
          setP(0);
        });
      } else {
        setP(0);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      html.style.overscrollBehaviorY = prevOverscroll;
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [threshold]);

  return { pull, refreshing };
}
