// Kicks off the JS chunk download for a lazy-loaded route BEFORE the
// user navigates, so the actual navigation feels instant instead of
// paying the network round-trip at click time.
//
// Pair with onMouseEnter / onFocus / onTouchStart on a link. Hover
// usually gives us 100–300ms of head-start on desktop; focus catches
// keyboard users; touchstart catches iOS where there's no hover.
//
// Dynamic imports are deduped by the browser's module cache, so
// calling prefetchRoute('hire') ten times only downloads the chunk
// once. We fire-and-forget — errors are swallowed because a prefetch
// failure is not user-facing; the real navigation will surface any
// actual error via Suspense / the ErrorBoundary.
//
// Uses requestIdleCallback when available so the prefetch doesn't
// compete with foreground work (input handling, animation frames).
// Falls back to setTimeout(0) on Safari (which doesn't ship rIC yet).

type RouteKey =
  | 'hire'
  | 'students'
  | 'students-by-category'
  | 'student-profile'
  | 'profile'
  | 'messages'
  | 'auth'
  | 'business-dashboard'
  | 'hire-requests'
  | 'list-on-community'
  | 'ai-find-results'
  | 'job-detail'
  | 'vano-pay';

// The map mirrors the lazy() imports in App.tsx exactly — keep in
// sync if routes change. Splitting this out of App.tsx means a hover
// can fire the import without instantiating React's lazy() wrapper.
const routeImports: Record<RouteKey, () => Promise<unknown>> = {
  hire:                    () => import('@/pages/HirePage'),
  students:                () => import('@/pages/BrowseStudents'),
  'students-by-category':  () => import('@/pages/StudentsByCategory'),
  'student-profile':       () => import('@/pages/StudentProfile'),
  profile:                 () => import('@/pages/Profile'),
  messages:                () => import('@/pages/Messages'),
  auth:                    () => import('@/pages/Auth'),
  'business-dashboard':    () => import('@/pages/BusinessDashboard'),
  'hire-requests':         () => import('@/pages/HireRequests'),
  'list-on-community':     () => import('@/pages/ListOnCommunity'),
  'ai-find-results':       () => import('@/pages/AiFindResults'),
  'job-detail':            () => import('@/pages/JobDetail'),
  'vano-pay':              () => import('@/pages/VanoPay'),
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
      // Prefetch failed (offline / chunk 404) — let the actual
      // navigation fail loudly through the ErrorBoundary. We just
      // un-mark so a later hover can try again.
      alreadyPrefetched.delete(key);
    });
  });
}

/**
 * Shortcut for onMouseEnter / onFocus / onTouchStart spread on any
 * link element. Identical work from any of the three triggers — the
 * Set dedupes so only the first one costs anything.
 */
export function prefetchHandlers(key: RouteKey) {
  const run = () => prefetchRoute(key);
  return {
    onMouseEnter: run,
    onFocus: run,
    onTouchStart: run,
  };
}
