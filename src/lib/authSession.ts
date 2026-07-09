import type { Session } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isCommunityCategoryId } from '@/lib/communityCategories';

const TALENT_BOARD_RETURN_KEY = 'vano_post_auth_talent_return';
const PENDING_CLAIM_TOKEN_KEY = 'vano_pending_claim_token';
// Set by /ai-find-return when the user lands there signed-out after
// paying via Stripe Payment Link. Post-auth resolvers consume it so
// the user goes straight back to their paid match instead of a
// generic dashboard. Kept in localStorage (not session-) because
// magic-link sign-in opens a new tab.
const AI_FIND_RETURN_KEY = 'vano_ai_find_return_session_id';

/**
 * A UUID v4 that the /claim/:token page sets before redirecting to /auth,
 * so the post-auth router knows to bounce the user back to finish the
 * scouted-freelancer claim instead of dropping them on /profile.
 */
function isUuidV4Like(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
}

export function rememberPendingClaimToken(token: string): void {
  if (!isUuidV4Like(token)) return;
  sessionStorage.setItem(PENDING_CLAIM_TOKEN_KEY, token);
}

function peekPendingClaimToken(): string | null {
  const t = sessionStorage.getItem(PENDING_CLAIM_TOKEN_KEY);
  return t && isUuidV4Like(t) ? t : null;
}

export function clearPendingClaimToken(): void {
  sessionStorage.removeItem(PENDING_CLAIM_TOKEN_KEY);
}

/**
 * Safe in-app return path after auth: talent hub `/students` or `/students?cat=…` only.
 */
export function safeReturnAfterAuth(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  try {
    const u = new URL(path, 'https://vanojobs.invalid');
    if (u.pathname !== '/students') return null;
    const cat = u.searchParams.get('cat');
    if (u.search && !cat) return null;
    if (cat && !isCommunityCategoryId(cat)) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}

/** Call before opening `/auth` from the talent board so OAuth round-trips still return here. */
export function rememberTalentBoardReturn(path: string): void {
  const s = safeReturnAfterAuth(path);
  if (s) sessionStorage.setItem(TALENT_BOARD_RETURN_KEY, s);
}

function clearTalentBoardReturn(): void {
  sessionStorage.removeItem(TALENT_BOARD_RETURN_KEY);
}

/**
 * Peek-and-clear helper for the AI Find paid-but-signed-out recovery.
 * Returns the Stripe checkout session_id if one was stashed by
 * /ai-find-return, and clears it so a second sign-in doesn't route
 * to a stale return page. UUID-ish shape check keeps a random value
 * written by something else from forcing a redirect.
 */
function consumePendingAiFindReturn(): string | null {
  try {
    const raw = localStorage.getItem(AI_FIND_RETURN_KEY);
    if (!raw) return null;
    localStorage.removeItem(AI_FIND_RETURN_KEY);
    // Stripe checkout session IDs are `cs_` followed by a long
    // alphanumeric suffix. Reject anything else.
    if (!/^cs_[A-Za-z0-9_]{20,}$/.test(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Same as getPostAuthPath, but if the user meant to return to the talent board, send them there instead of /profile.
 */
export async function resolvePostAuthDestination(userId: string): Promise<string> {
  // A paid AI Find that needs recovering takes the very top slot —
  // the user spent €1 to reach this sign-in and deserves to land on
  // their match, not a generic dashboard. /ai-find-return will use
  // the session_id to locate the row and route on to /ai-find/:id.
  const aiFindSessionId = consumePendingAiFindReturn();
  if (aiFindSessionId) {
    return `/ai-find-return?session_id=${encodeURIComponent(aiFindSessionId)}`;
  }

  // A pending scouted-freelancer claim takes priority over every other
  // post-auth destination — the visitor literally clicked a claim link
  // and then got funneled through /auth. Send them straight back so
  // /claim/:token can finish the claim RPC.
  const claimToken = peekPendingClaimToken();
  if (claimToken) return `/claim/${claimToken}`;

  // Talent-board returns pointed at the legacy /students page (deleted with
  // the freelancer marketplace — it 404s now). Clear any stale stash rather
  // than honouring it.
  clearTalentBoardReturn();
  return getPostAuthPath(userId);
}

/**
 * Same as getPostGoogleAuthPath, minus any stale legacy return stash.
 */
export async function resolvePostGoogleAuthDestination(userId: string): Promise<string> {
  // See resolvePostAuthDestination — paid AI Find wins over every
  // other post-auth destination.
  const aiFindSessionId = consumePendingAiFindReturn();
  if (aiFindSessionId) {
    return `/ai-find-return?session_id=${encodeURIComponent(aiFindSessionId)}`;
  }

  const claimToken = peekPendingClaimToken();
  if (claimToken) return `/claim/${claimToken}`;

  clearTalentBoardReturn();
  return getPostGoogleAuthPath(userId);
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
