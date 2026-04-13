import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified, resolvePostGoogleAuthDestination } from '@/lib/authSession';
import {
  clearGoogleOAuthIntent,
  ensureProfileAfterGoogleOAuth,
  hasGoogleOAuthPending,
} from '@/lib/googleOAuth';
import { hasPendingHireBrief } from '@/lib/hireFlow';

/**
 * Runs after OAuth redirect to site root: restores profile row, then routes by profile completeness and user_type.
 *
 * Special case: when a signed-out user kicked off OAuth from the hire wizard,
 * a pending brief is stored. In that case, route straight back to `/hire` so
 * the brief can resume + auto-submit, skipping any dashboard detour.
 */
export async function tryFinishGoogleOAuthRedirect(navigate: NavigateFunction): Promise<boolean> {
  if (!hasGoogleOAuthPending()) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || !isEmailVerified(session)) return false;
  try {
    await ensureProfileAfterGoogleOAuth(session);
    clearGoogleOAuthIntent();
    if (hasPendingHireBrief()) {
      navigate('/hire', { replace: true });
      return true;
    }
    const path = await resolvePostGoogleAuthDestination(session.user.id);
    navigate(path, { replace: true });
    return true;
  } catch {
    clearGoogleOAuthIntent();
    return false;
  }
}
