import type { Session } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isCommunityCategoryId } from '@/lib/communityCategories';

const TALENT_BOARD_RETURN_KEY = 'vano_post_auth_talent_return';

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

function peekTalentBoardReturn(): string | null {
  return safeReturnAfterAuth(sessionStorage.getItem(TALENT_BOARD_RETURN_KEY));
}

function clearTalentBoardReturn(): void {
  sessionStorage.removeItem(TALENT_BOARD_RETURN_KEY);
}

/**
 * Same as getPostAuthPath, but if the user meant to return to the talent board, send them there instead of /profile.
 */
export async function resolvePostAuthDestination(userId: string): Promise<string> {
  const base = await getPostAuthPath(userId);
  const returnTo = peekTalentBoardReturn();
  if (base === '/profile' && returnTo) {
    clearTalentBoardReturn();
    return returnTo;
  }
  if (base === '/profile') clearTalentBoardReturn();
  return base;
}

/**
 * Same as getPostGoogleAuthPath, with talent-board return preference when landing on /profile.
 */
export async function resolvePostGoogleAuthDestination(userId: string): Promise<string> {
  const base = await getPostGoogleAuthPath(userId);
  const returnTo = peekTalentBoardReturn();
  if (base === '/profile' && returnTo) {
    clearTalentBoardReturn();
    return returnTo;
  }
  if (base === '/profile') clearTalentBoardReturn();
  return base;
}

/** Supabase: `user.email_confirmed_at` is the analogue of Firebase `emailVerified`. */
export function isEmailVerified(session: Session | null): boolean {
  if (!session?.user) return false;
  return Boolean(session.user.email_confirmed_at);
}

/**
 * Where to send a signed-in user: profile when complete; otherwise business → dashboard, freelancer → complete-profile.
 */
export async function getPostAuthPath(
  userId: string,
): Promise<'/profile' | '/choose-account-type' | '/complete-profile' | '/dashboard'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, user_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.user_type?.trim()) return '/choose-account-type';

  const done = !!(profile?.display_name?.trim() && profile?.avatar_url?.trim());
  if (done) return '/profile';
  if (profile?.user_type === 'business') return '/dashboard';
  return '/complete-profile';
}

/**
 * After Google OAuth (and account-type choice): no user_type → picker; else incomplete → /complete-profile; complete → /dashboard.
 */
export async function getPostGoogleAuthPath(
  userId: string,
): Promise<'/choose-account-type' | '/complete-profile' | '/profile'> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, user_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.user_type?.trim()) return '/choose-account-type';

  const done = !!(profile?.display_name?.trim() && profile?.avatar_url?.trim());
  if (!done) return '/complete-profile';
  return '/profile';
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
