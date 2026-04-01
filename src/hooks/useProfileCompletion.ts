import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified } from '@/lib/authSession';

/**
 * Redirects logged-in users to /complete-profile if they're missing
 * a display_name or avatar_url. Call at the top of protected pages.
 */
export function useProfileCompletion() {
  const [complete, setComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Don't run on the complete-profile page itself or auth-related pages
    const skip = ['/complete-profile', '/auth', '/reset-password'];
    if (skip.includes(location.pathname)) {
      setComplete(true);
      return;
    }

    let cancelled = false;

    // Use onAuthStateChange so we wait for the real session to be restored
    // from localStorage before making any decisions. getSession() can resolve
    // with null before Supabase finishes reading storage, causing the check
    // to be skipped entirely on page refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // We only need the initial session value — unsubscribe immediately
      // so this doesn't fire again on sign-in/sign-out events (those are
      // handled by RequireVerifiedSession via useAuthSession).
      subscription.unsubscribe();
      if (cancelled) return;

      if (!session) { setComplete(true); return; }

      if (!isEmailVerified(session)) {
        navigate('/auth', { replace: true });
        setComplete(false);
        return;
      }

      void supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', session.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (cancelled) return;
          const hasName = profile?.display_name && profile.display_name.trim().length > 0;
          const hasAvatar = profile?.avatar_url && profile.avatar_url.trim().length > 0;
          if (!hasName || !hasAvatar) {
            navigate('/complete-profile', { replace: true });
            setComplete(false);
          } else {
            setComplete(true);
          }
        });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  return complete;
}
