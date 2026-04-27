import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { clearGoogleOAuthIntent } from '@/lib/googleOAuth';

/**
 * Global (not user-scoped) storage keys that leak identity or form state
 * across sign-outs. The Supabase session keys (`sb-*`) are cleared by the
 * loop below; these are Vano-specific hints/drafts that also need to die
 * when the current user signs out so a second user on the same device
 * doesn't inherit them.
 *
 * User-scoped keys (e.g. `vano:list-on-community-draft:${userId}`) are
 * deliberately NOT cleared — they're namespaced by user id so they only
 * rehydrate for the same user's next session.
 */
const GLOBAL_LOCAL_STORAGE_KEYS = [
  'vano_magiclink_user_type',
  'vano_magiclink_email',
  'vano_magiclink_pending',
  'vano_ai_find_return_session_id',
  'vano_direct_hire_draft',
  // Hire brief moved to localStorage (with TTL) so it survives the OAuth
  // round-trip on browsers that clear sessionStorage (mobile Safari with
  // cross-site tracking prevention, some in-app browsers). Cleared on
  // sign-out so the next user on the same device doesn't inherit it.
  'vano_hire_brief_v1',
  'vano_hire_brief_autopay_v1',
];

const GLOBAL_SESSION_STORAGE_KEYS = [
  'vano_welcome_email_sent',
];

/**
 * Single source of truth for signing out. Previously three call sites
 * (Navbar, Auth page, Profile page) each had their own cleanup logic —
 * Navbar had NONE, which meant a user signing out via the nav bar left
 * Supabase session keys + Vano hints in localStorage. When a second
 * account signed in on the same device, the old keys interfered (seen
 * as "UI glitches between business and freelancer accounts").
 *
 * Clears in this order:
 *   1. Supabase session (global scope kills all tabs/devices).
 *   2. Supabase keys from localStorage (sb-*, anything with 'supabase').
 *   3. Vano global storage keys (magic link hints, drafts, flags).
 *   4. In-memory Google OAuth intent flag.
 *   5. React Query cache — user-scoped data (profiles, messages, hire
 *      requests) that would otherwise be served stale to the next user.
 */
export async function signOutCleanly(queryClient?: QueryClient): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch {
    /* Network fail on signOut is non-fatal — local cleanup still runs. */
  }

  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    });
    GLOBAL_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* localStorage unavailable (private mode, storage disabled) — skip. */
  }

  try {
    GLOBAL_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* sessionStorage unavailable — skip. */
  }

  clearGoogleOAuthIntent();

  if (queryClient) {
    queryClient.clear();
  }
}
