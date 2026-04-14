import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuthContext';

/**
 * Renders children only when there is a session with a confirmed email.
 * Otherwise redirects to /auth (with state for OTP continuation).
 *
 * Reads from the shared AuthProvider (mounted once at app root) rather than
 * spinning up a new supabase.auth.onAuthStateChange subscription per mount.
 * The latter briefly flashed a full-screen "Loading…" spinner every time the
 * user navigated into a protected route because `loading` started as `true`
 * until the first INITIAL_SESSION event fired (~100–300ms).
 */
export function RequireVerifiedSession({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, isVerified } = useAuth();

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
