import type { Session } from '@supabase/supabase-js';
import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ensureAutoStudentVerificationFromEmail } from '@/lib/studentVerification';

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
): Promise<'/profile' | '/choose-account-type' | '/verify-student' | '/complete-profile' | '/dashboard'> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id === userId) {
    await ensureAutoStudentVerificationFromEmail(session);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, user_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.user_type?.trim()) return '/choose-account-type';

  if (profile.user_type === 'student') {
    const { data: sp } = await supabase
      .from('student_profiles')
      .select('student_verified')
      .eq('user_id', userId)
      .maybeSingle();
    if (!sp?.student_verified) return '/verify-student';
  }

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
): Promise<'/choose-account-type' | '/verify-student' | '/complete-profile' | '/dashboard'> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id === userId) {
    await ensureAutoStudentVerificationFromEmail(session);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, user_type')
    .eq('user_id', userId)
    .maybeSingle();
  if (!profile?.user_type?.trim()) return '/choose-account-type';

  if (profile.user_type === 'student') {
    const { data: sp } = await supabase
      .from('student_profiles')
      .select('student_verified')
      .eq('user_id', userId)
      .maybeSingle();
    if (!sp?.student_verified) return '/verify-student';
  }

  const done = !!(profile?.display_name?.trim() && profile?.avatar_url?.trim());
  if (!done) return '/complete-profile';
  return '/dashboard';
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
