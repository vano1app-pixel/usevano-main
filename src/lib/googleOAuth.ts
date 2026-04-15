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
 * Provider-agnostic: creates or patches `profiles` after any successful auth
 * flow (Google OAuth, magic-link, future OTP). Takes the resolved user_type
 * intent as an argument so callers can read from wherever it was stashed
 * (sessionStorage for Google, localStorage for magic-link).
 *
 * If `resolvedFromIntent` is null the user lands with no user_type and the
 * existing ChooseAccountType flow catches them.
 */
export async function ensureProfileAfterAuth(
  session: Session,
  resolvedFromIntent: 'student' | 'business' | null,
): Promise<void> {
  const userId = session.user.id;

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
    const { error: insErr } = await supabase.from('profiles').insert({
      user_id: userId,
      display_name: name,
      user_type: resolvedFromIntent,
    });
    if (insErr) throw insErr;
    if (resolvedFromIntent === 'student') {
      const { error: spErr } = await supabase.from('student_profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
      if (spErr) throw spErr;
    }
    return;
  }

  if (!existing.user_type && resolvedFromIntent) {
    const { error: upErr } = await supabase.from('profiles').update({ user_type: resolvedFromIntent }).eq('user_id', userId);
    if (upErr) throw upErr;
    if (resolvedFromIntent === 'student') {
      const { error: spErr } = await supabase.from('student_profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
      if (spErr) throw spErr;
    }
  }
}

/**
 * Google-specific wrapper. Reads the user_type intent from sessionStorage
 * (where setGoogleOAuthIntent stashed it before the OAuth redirect) and
 * delegates to the provider-agnostic helper. Preserved as a named export so
 * the existing callers in finishGoogleOAuthRedirect don't need to change.
 */
export async function ensureProfileAfterGoogleOAuth(session: Session): Promise<void> {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(GOOGLE_OAUTH_USER_TYPE_KEY);
  } catch {
    /* ignore */
  }
  const resolvedFromIntent: 'student' | 'business' | null =
    stored === 'business' ? 'business' : stored === 'student' ? 'student' : null;
  return ensureProfileAfterAuth(session, resolvedFromIntent);
}
