import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setComplete(true); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const hasName = profile?.display_name && profile.display_name.trim().length > 0;
      const hasAvatar = profile?.avatar_url && profile.avatar_url.trim().length > 0;

      if (!hasName || !hasAvatar) {
        navigate('/complete-profile', { replace: true });
        setComplete(false);
      } else {
        setComplete(true);
      }
    };
    check();
  }, [navigate, location.pathname]);

  return complete;
}
