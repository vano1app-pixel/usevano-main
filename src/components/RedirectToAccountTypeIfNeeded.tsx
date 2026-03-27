import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthSession } from '@/hooks/useAuthSession';

const SKIP_PREFIXES = ['/auth', '/choose-account-type', '/reset-password'];

/**
 * After OAuth or legacy sign-up, users may have no `profiles.user_type`.
 * Send them to the account-type picker before using the rest of the app.
 */
export function RedirectToAccountTypeIfNeeded() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, isVerified } = useAuthSession();
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session || !isVerified) {
      setOverlay(false);
      return;
    }
    const path = location.pathname;
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
      setOverlay(false);
      return;
    }

    let cancelled = false;
    setOverlay(true);
    void (async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!profile?.user_type?.trim()) {
        navigate('/choose-account-type', { replace: true, state: { from: path } });
      }
      setOverlay(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session, isVerified, location.pathname, navigate]);

  if (!overlay) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">Loading your account…</p>
    </div>
  );
}
