/**
 * Minimal Suspense fallback for lazy-loaded routes. Previously null, which
 * meant slow networks saw a blank frame between pages while the chunk
 * downloaded. A centered spinner felt janky (pop-in), so this renders a
 * thin top-of-page progress bar instead — present but unobtrusive, and
 * purely CSS-animated so there's nothing to hydrate.
 */
export function RouteSuspenseFallback() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] h-0.5 overflow-hidden"
    >
      <div className="h-full w-1/3 animate-pulse bg-primary/60" />
    </div>
  );
}
