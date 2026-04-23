import type { NavigateFunction } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified, resolvePostGoogleAuthDestination } from '@/lib/authSession';
import {
  clearGoogleOAuthIntent,
  ensureProfileAfterGoogleOAuth,
  hasGoogleOAuthPending,
} from '@/lib/googleOAuth';
import { hasPendingHireBrief } from '@/lib/hireFlow';
import type { AuthFinishResult } from '@/lib/magicLink';

/**
 * Runs after OAuth redirect to site root: restores profile row, then routes by profile completeness and user_type.
 *
 * Special case: when a signed-out user kicked off OAuth from the hire wizard,
 * a pending brief is stored. In that case, route straight back to `/hire` so
 * the brief can resume + auto-submit, skipping any dashboard detour.
 *
 * Returns a status object (not a boolean) so Landing can surface a real toast
 * when profile setup throws. The old silent-catch made auth-setup failures
 * indistinguishable from "not-applicable", which is how a recent RLS
 * regression read to users as "I can't log in" with zero feedback.
 */
export async function tryFinishGoogleOAuthRedirect(navigate: NavigateFunction): Promise<AuthFinishResult> {
  if (!hasGoogleOAuthPending()) return { status: 'not-applicable' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user || !isEmailVerified(session)) return { status: 'not-applicable' };
  try {
    await ensureProfileAfterGoogleOAuth(session);
    clearGoogleOAuthIntent();
    if (hasPendingHireBrief()) {
      navigate('/hire', { replace: true });
      return { status: 'routed' };
    }
    const path = await resolvePostGoogleAuthDestination(session.user.id);
    navigate(path, { replace: true });
    return { status: 'routed' };
  } catch (err) {
    clearGoogleOAuthIntent();
    const message = (err as { message?: string })?.message || 'Signed in, but we could not set up your profile.';
    console.error('[tryFinishGoogleOAuthRedirect] profile setup failed', err);
    return { status: 'error', message };
  }
}
