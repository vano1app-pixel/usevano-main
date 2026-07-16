import type { Session } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Return stashes written by the DELETED freelancer marketplace (the /claim
// scouted-freelancer flow, the /students talent board, the paid AI Find
// recovery). Their destination pages 404 now, so a stale stash must never be
// honoured — a helper signing in on an old device was getting bounced to a
// dead page straight after auth. Cleared on every post-auth resolve; the
// keys stay listed here (and in signOut.ts) until they've aged out of
// browsers.
const LEGACY_RETURN_KEYS = {
  session: ['vano_post_auth_talent_return', 'vano_pending_claim_token'],
  local:   ['vano_ai_find_return_session_id'],
} as const;

function clearLegacyReturnStashes(): void {
  try {
    for (const k of LEGACY_RETURN_KEYS.session) sessionStorage.removeItem(k);
    for (const k of LEGACY_RETURN_KEYS.local) localStorage.removeItem(k);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * Post-auth destination (magic link + the /auth "Continue as" button).
 * Discards any legacy marketplace return stash, then routes by account —
 * every branch lands on a MOUNTED route.
 */
export async function resolvePostAuthDestination(userId: string): Promise<string> {
  clearLegacyReturnStashes();
  return getPostAuthPath(userId);
}

/**
 * Same as resolvePostAuthDestination — kept as a separate export because the
 * Google OAuth callback (magicLink.ts) imports it by this name.
 */
export async function resolvePostGoogleAuthDestination(userId: string): Promise<string> {
  return resolvePostAuthDestination(userId);
}

/** Supabase: `user.email_confirmed_at` is the analogue of Firebase `emailVerified`. */
export function isEmailVerified(session: Session | null): boolean {
  if (!session?.user) return false;
  return Boolean(session.user.email_confirmed_at);
}

/**
 * Where to send a signed-in user. Only helpers sign in today, so every branch
 * must land on a MOUNTED route — the old marketplace destinations
 * (/choose-account-type, /profile, /list-on-community, /business-dashboard,
 * /complete-profile) were deleted with the freelancer frontend and 404 now.
 *   - linked approved helper → /student-dashboard
 *   - legacy 'customer'/'business' profile → /home (household homepage)
 *   - everyone else (no user_type, or legacy 'student') → /student-dashboard,
 *     which runs link-helper-account on mount. That IS the first-sign-in path
 *     for a helper whose row isn't linked to their auth account yet — routing
 *     them to the old account-type chooser 404'd them before they ever
 *     reached the linker.
 */
export async function getPostAuthPath(
  userId: string,
): Promise<'/home' | '/student-dashboard'> {
  // Approved household helpers always land on the helper dashboard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: helperRow } = await (supabase as any)
    .from('household_helpers')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .maybeSingle();
  if (helperRow) return '/student-dashboard';

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('user_id', userId)
    .maybeSingle();

  const userType = profile?.user_type?.trim();
  if (userType === 'customer' || userType === 'business') return '/home';
  return '/student-dashboard';
}

/**
 * After Google OAuth — same routing as getPostAuthPath.
 */
export async function getPostGoogleAuthPath(
  userId: string,
): Promise<'/home' | '/student-dashboard'> {
  return getPostAuthPath(userId);
}

/**
 * Blocks protected routes unless the user has a session with a verified email.
 * Redirects to `/auth` when missing or unverified.
 */
export function guardVerifiedSession(
  session: Session | null,
  navigate: NavigateFunction,
): session is Session {
  if (!session) {
    navigate('/auth', { replace: true });
    return false;
  }
  if (!isEmailVerified(session)) {
    navigate('/auth', { replace: true });
    return false;
  }
  return true;
}
