/**
 * DOM safeguards against a well-known class of React crashes where the DOM
 * has been mutated by a third-party (browser extension, notably Google
 * Translate) or by a race between React's reconciler and an animation
 * library. The surface error is:
 *
 *   "Failed to execute 'removeChild' on 'Node': The node to be removed is
 *    not a child of this node."
 *
 * ...or the same for `insertBefore`. The real work has already happened
 * (React's virtual DOM and the user's expected UI are fine) — the native
 * call just can't find the child to remove because something else got
 * there first.
 *
 * The community-standard fix is to soften the two native calls so they
 * bail out quietly instead of throwing when the child is already gone.
 * This runs exactly once at module import time — call it before the React
 * root is created.
 *
 * Refs:
 *  - https://github.com/facebook/react/issues/11538 (Google Translate)
 *  - https://github.com/framer/motion/issues/1375 (AnimatePresence)
 */

let applied = false;

export function applyDomSafeguards(): void {
  if (applied) return;
  if (typeof Node !== 'function' || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // Already removed (by an extension, a portal, or a race). Do nothing
      // instead of throwing — the caller expects the node to be gone, which
      // it already is.
      if (import.meta.env.DEV) {
        console.warn('[domSafeguards] removeChild: node already detached', child);
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      // Reference node is gone — append instead of throwing.
      if (import.meta.env.DEV) {
        console.warn('[domSafeguards] insertBefore: reference already detached', referenceNode);
      }
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  } as typeof Node.prototype.insertBefore;

  applied = true;
}
