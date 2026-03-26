import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getPostGoogleAuthPath, isEmailVerified } from '@/lib/authSession';
import {
  clearGoogleOAuthIntent,
  ensureProfileAfterGoogleOAuth,
  hasGoogleOAuthPending,
} from '@/lib/googleOAuth';

/**
 * Runs after OAuth redirect to site root: restores profile row, then routes by profile completeness and user_type.
 */
export async function tryFinishGoogleOAuthRedirect(navigate: NavigateFunction): Promise<boolean> {
  if (!hasGoogleOAuthPending()) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || !isEmailVerified(session)) return false;
  try {
    await ensureProfileAfterGoogleOAuth(session);
    clearGoogleOAuthIntent();
    const path = await getPostGoogleAuthPath(session.user.id);
    navigate(path, { replace: true });
    return true;
  } catch {
    clearGoogleOAuthIntent();
    return false;
  }
}
