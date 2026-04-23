import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isEmailVerified } from '@/lib/authSession';

/**
 * Redirects logged-in users to /complete-profile if they're missing a
 * display_name. Avatar is intentionally NOT required — the only page that
 * lets a freelancer upload one is /profile, and gating access to /profile
 * on "has avatar" created an infinite redirect trap for anyone who signed
 * up via magic link (OTP sign-ups have no user_metadata.avatar_url, so
 * the profile row was created with avatar_url NULL and the guard bounced
 * them from /profile → /complete-profile → /list-on-community forever).
 * Avatar upload stays encouraged via the profile-completion card inside
 * /profile; it's no longer a hard block.
 */
export function useProfileCompletion() {
  const [complete, setComplete] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const skip = ['/complete-profile', '/auth', '/reset-password', '/choose-account-type', '/business-dashboard'];
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
          .select('display_name, user_type')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (cancelled) return;
        const hasName = profile?.display_name && profile.display_name.trim().length > 0;

        if (!hasName) {
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
