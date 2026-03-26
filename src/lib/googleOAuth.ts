import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Set in sessionStorage immediately before `signInWithOAuth({ provider: 'google' })`.
 * After redirect back to the site root (OAuth `redirectTo`), Landing runs post-OAuth routing.
 */
export const GOOGLE_OAUTH_PENDING_KEY = 'vano_oauth_pending';
export const GOOGLE_OAUTH_USER_TYPE_KEY = 'vano_oauth_user_type';

export function setGoogleOAuthIntent(userType: 'student' | 'business' | null) {
  try {
    sessionStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, '1');
    if (userType) sessionStorage.setItem(GOOGLE_OAUTH_USER_TYPE_KEY, userType);
    else sessionStorage.removeItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearGoogleOAuthIntent() {
  try {
    sessionStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns true if we should run post-OAuth profile setup (user just returned from Google).
 */
export function hasGoogleOAuthPending(): boolean {
  try {
    return sessionStorage.getItem(GOOGLE_OAUTH_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Creates or patches `profiles` after Google sign-in.
 * Sign-up with Freelancer/Business selected stores `user_type` in sessionStorage before OAuth.
 * Log-in with no selection leaves `user_type` null until `/choose-account-type`.
 */
export async function ensureProfileAfterGoogleOAuth(session: Session): Promise<void> {
  const userId = session.user.id;
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
  const resolvedFromIntent: 'student' | 'business' | null =
    stored === 'business' ? 'business' : stored === 'student' ? 'student' : null;

  const name =
    (session.user.user_metadata?.full_name as string | undefined) ||
    (session.user.user_metadata?.name as string | undefined) ||
    session.user.email?.split('@')[0] ||
    'User';

  const { data: existing } = await supabase
    .from('profiles')
    .select('user_id, user_type')
    .eq('user_id', userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from('profiles').insert({
      user_id: userId,
      display_name: name,
      user_type: resolvedFromIntent,
    });
    if (resolvedFromIntent === 'student') {
      await supabase.from('student_profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
    }
    return;
  }

  if (!existing.user_type && resolvedFromIntent) {
    await supabase.from('profiles').update({ user_type: resolvedFromIntent }).eq('user_id', userId);
    if (resolvedFromIntent === 'student') {
      await supabase.from('student_profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
    }
  }
}
