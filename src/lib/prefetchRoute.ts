// Kicks off the JS chunk download for a lazy-loaded route BEFORE the
// user navigates, so the actual navigation feels instant instead of
// paying the network round-trip at click time.
//
// Pair with onMouseEnter / onFocus / onTouchStart on a link. Hover
// usually gives us 100–300ms of head-start on desktop; focus catches
// keyboard users; touchstart catches iOS where there's no hover.
//
// Dynamic imports are deduped by the browser's module cache, so
// calling prefetchRoute('auth') ten times only downloads the chunk
// once. We fire-and-forget — errors are swallowed because a prefetch
// failure is not user-facing; the real navigation will surface any
// actual error via Suspense / the ErrorBoundary.
//
// Uses requestIdleCallback when available so the prefetch doesn't
// compete with foreground work (input handling, animation frames).
// Falls back to setTimeout(0) on Safari (which doesn't ship rIC yet).

type RouteKey =
  | 'auth'
  | 'join'
  | 'book'
  | 'track'
  | 'student-dashboard'
  | 'helper-profile';

const routeImports: Record<RouteKey, () => Promise<unknown>> = {
  auth:               () => import('@/pages/Auth'),
  join:               () => import('@/pages/JoinAsHelper'),
  book:               () => import('@/pages/BookingFlow'),
  track:              () => import('@/pages/TrackBooking'),
  'student-dashboard': () => import('@/pages/StudentDashboard'),
  'helper-profile':   () => import('@/pages/HelperProfile'),
};

const alreadyPrefetched = new Set<RouteKey>();

function scheduleIdle(fn: () => void): void {
  const win = typeof window !== 'undefined' ? window : null;
  if (!win) return;
  const idle = (win as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (typeof idle === 'function') {
    idle(fn);
  } else {
    setTimeout(fn, 0);
  }
}

export function prefetchRoute(key: RouteKey): void {
  if (alreadyPrefetched.has(key)) return;
  alreadyPrefetched.add(key);
  scheduleIdle(() => {
    routeImports[key]().catch(() => {
      alreadyPrefetched.delete(key);
    });
  });
}

export function prefetchHandlers(key: RouteKey) {
  const run = () => prefetchRoute(key);
  return {
    onMouseEnter: run,
    onFocus: run,
    onTouchStart: run,
  };
}
