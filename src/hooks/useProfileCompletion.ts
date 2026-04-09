import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified } from '@/lib/authSession';

/**
 * Redirects logged-in users to /complete-profile if they're missing
 * a display_name or avatar_url. For students also checks phone — if
 * phone is missing, redirects to /complete-profile-step2.
 */
export function useProfileCompletion() {
  const [complete, setComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const skip = ['/complete-profile', '/complete-profile-step2', '/auth', '/reset-password', '/choose-account-type', '/business-dashboard'];
    if (skip.includes(location.pathname)) {
      setComplete(true);
      return;
    }

    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      subscription.unsubscribe();
      if (cancelled) return;

      if (!session) { setComplete(true); return; }

      if (!isEmailVerified(session)) {
        navigate('/auth', { replace: true });
        setComplete(false);
        return;
      }

      void (async () => {
        if (cancelled) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, user_type')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (cancelled) return;
        const hasName = profile?.display_name && profile.display_name.trim().length > 0;
        const hasAvatar = profile?.avatar_url && profile.avatar_url.trim().length > 0;

        if (!hasName || !hasAvatar) {
          navigate('/complete-profile', { replace: true });
          setComplete(false);
          return;
        }

        setComplete(true);
      })();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  return complete;
}
