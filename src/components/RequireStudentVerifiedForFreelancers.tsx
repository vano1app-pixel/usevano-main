import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthSession } from '@/hooks/useAuthSession';
import { ensureAutoStudentVerificationFromEmail } from '@/lib/studentVerification';

/**
 * After email is verified: freelancers must complete institutional email verification before the rest of the app.
 * Business accounts are unaffected. `/verify-student` is excluded from the redirect loop.
 */
export function RequireStudentVerifiedForFreelancers({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: authLoading } = useAuthSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!session) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      await ensureAutoStudentVerificationFromEmail(session);

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profile?.user_type !== 'student') {
        setReady(true);
        return;
      }

      const { data: sp } = await supabase
        .from('student_profiles')
        .select('student_verified')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (sp?.student_verified) {
        setReady(true);
        return;
      }

      if (location.pathname === '/verify-student') {
        setReady(true);
        return;
      }

      navigate('/verify-student', { replace: true, state: { from: location.pathname } });
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session, navigate, location.pathname]);

  if (authLoading || !ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
