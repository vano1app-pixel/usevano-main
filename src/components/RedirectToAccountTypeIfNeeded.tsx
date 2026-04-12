import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuthContext';

const SKIP_PREFIXES = ['/auth', '/choose-account-type', '/reset-password', '/business-dashboard', '/complete-profile'];

/**
 * After OAuth or legacy sign-up, users may have no `profiles.user_type`.
 * Send them to the account-type picker before using the rest of the app.
 *
 * Uses the shared AuthProvider cache rather than querying profiles on every
 * navigation — previously this component fired a round-trip per route change
 * and showed a full-screen blocking overlay while it waited.
 */
export function RedirectToAccountTypeIfNeeded() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading, isVerified, userType, profileLoading } = useAuth();

  useEffect(() => {
    if (loading || profileLoading) return;
    if (!session || !isVerified) return;
    const path = location.pathname;
    if (SKIP_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return;
    if (!userType?.trim()) {
      navigate('/choose-account-type', { replace: true, state: { from: path } });
    }
  }, [loading, profileLoading, session, isVerified, userType, location.pathname, navigate]);

  // Show a subtle overlay only while we're still fetching the profile AFTER
  // a confirmed sign-in. No overlay on sign-out, on the skip-listed routes,
  // or once we know the user_type. Keeps navigation snappy everywhere else.
  const showOverlay =
    Boolean(session) &&
    isVerified &&
    profileLoading &&
    !SKIP_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  if (!showOverlay) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">Loading your account…</p>
    </div>
  );
}
