import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthSession } from '@/hooks/useAuthSession';

/**
 * Renders children only when there is a session with a confirmed email.
 * Otherwise redirects to /auth (with state for OTP continuation).
 */
export function RequireVerifiedSession({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, isVerified } = useAuthSession();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate('/auth', { replace: true, state: { from: location.pathname } });
      return;
    }
    if (!isVerified) {
      navigate('/auth', { replace: true, state: { pendingVerification: true } });
    }
  }, [loading, session, isVerified, navigate, location.pathname]);

  if (loading || !session || !isVerified) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
