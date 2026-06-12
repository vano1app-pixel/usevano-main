/**
 * Hard recovery for "stale deploy" states: a tab whose HTML/chunks predate
 * the current deploy, usually because the old service worker is still
 * serving its precache. A plain location.reload() is NOT enough — the old
 * SW happily serves the old index.html again and the tab stays stuck on
 * the "new version is ready" card forever.
 *
 * This promotes the waiting service worker first (the SKIP_WAITING
 * handshake sw.ts implements), and if there's no newer worker to promote,
 * unregisters the wedged one outright — so the reload that follows is
 * guaranteed to fetch the new shell from the network. The SW re-registers
 * itself on the next load.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reloadToLatest(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        // Ask the browser to check for a newer SW (no-op when current)
        await reg.update().catch(() => {});
        const next = reg.waiting ?? reg.installing;
        if (next) {
          // Promote it, then reload once it takes control. controllerchange
          // usually lands well under 100ms — the race is just a watchdog so
          // a wedged worker can't hang the recovery.
          const takeover = new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          });
          next.postMessage({ type: 'SKIP_WAITING' });
          await Promise.race([takeover, sleep(1500)]);
        } else if (navigator.serviceWorker.controller) {
          // No newer worker found, yet we still ended up on the recovery
          // path — the active SW itself is serving a stale precache.
          // Unregister it; the next load comes straight from the network.
          await reg.unregister().catch(() => {});
        }
      }
    }
  } catch {
    /* recovery is best-effort — always fall through to the reload */
  }
  window.location.reload();
}
