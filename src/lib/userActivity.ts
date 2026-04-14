/**
 * "Has this user done something useful yet?" — a shared flag used to gate
 * noisy prompts (push notifications, PWA install banner) so they don't
 * interrupt a brand-new visitor before they've submitted a hire request
 * or published a listing.
 *
 * Flipped `true` by:
 *   - HirePage on a successful Vano Match submit
 *   - ListOnCommunityWizard on a successful publish
 *
 * Survives across sessions (localStorage), which is the point — once the
 * user has engaged, we stop treating them like a first-time visitor.
 */

const USER_ACTED_KEY = 'vano_user_acted';

export function markUserActed(): void {
  try {
    localStorage.setItem(USER_ACTED_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function hasUserActed(): boolean {
  try {
    return localStorage.getItem(USER_ACTED_KEY) === '1';
  } catch {
    return false;
  }
}
