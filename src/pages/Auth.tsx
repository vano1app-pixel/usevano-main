import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import { Briefcase, GraduationCap } from 'lucide-react';
import { isEmailVerified, rememberTalentBoardReturn, resolvePostAuthDestination } from '@/lib/authSession';
import { clearGoogleOAuthIntent, hasGoogleOAuthPending, setGoogleOAuthIntent } from '@/lib/googleOAuth';
import { cn } from '@/lib/utils';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { getGoogleOAuthRedirectUrl } from '@/lib/siteUrl';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const redirectIfAlreadySignedIn = useCallback(async () => {
    if (hasGoogleOAuthPending()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isEmailVerified(session)) return;
    const path = await resolvePostAuthDestination(session.user.id);
    navigate(path, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'signup') setIsLogin(false);
    else if (mode === 'login') setIsLogin(true);
  }, []);

  useEffect(() => {
    const from = (location.state as { from?: string } | null)?.from;
    if (from) rememberTalentBoardReturn(from);
  }, [location.state]);

  useEffect(() => {
    void redirectIfAlreadySignedIn();
    const delayed = window.setTimeout(() => void redirectIfAlreadySignedIn(), 700);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void redirectIfAlreadySignedIn();
    });
    return () => {
      window.clearTimeout(delayed);
      subscription.unsubscribe();
    };
  }, [redirectIfAlreadySignedIn]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      setGoogleOAuthIntent(isLogin ? null : userType);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getGoogleOAuthRedirectUrl(),
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) throw error;
    } catch (error: unknown) {
      clearGoogleOAuthIntent();
      setLoading(false);
      toast({
        title: 'Google sign-in failed',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <SEOHead
        title={`${isLogin ? 'Log in' : 'Create account'} – VANO`}
        description="Log in or sign up for VANO — local gigs and freelancers in Galway."
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {isLogin ? 'Welcome back' : 'Join VANO'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
            {isLogin ? 'Sign in to your account.' : 'Pick your role and continue with Google.'}
          </p>
        </div>

        <div className="flex rounded-xl border border-border bg-muted/40 p-1 mb-6">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsLogin(true);
              navigate('/auth?mode=login', { replace: true });
            }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              isLogin ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsLogin(false);
              navigate('/auth?mode=signup', { replace: true });
            }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
              !isLogin ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create account
          </button>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-5">
          {!isLogin && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Account type</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setUserType('student')}
                  className={cn(
                    'flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-all text-left',
                    userType === 'student'
                      ? 'border-emerald-500/70 bg-emerald-500/[0.07] shadow-sm'
                      : 'border-border text-muted-foreground hover:border-emerald-500/25',
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <GraduationCap className="text-emerald-600 shrink-0" size={20} />
                    Freelancer
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    Offer services &amp; join the community
                  </span>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setUserType('business')}
                  className={cn(
                    'flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-all text-left',
                    userType === 'business'
                      ? 'border-sky-500/70 bg-sky-500/[0.07] shadow-sm'
                      : 'border-border text-muted-foreground hover:border-sky-500/25',
                  )}
                >
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Briefcase className="text-sky-600 shrink-0" size={20} />
                    Business
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    Post gigs &amp; hire students
                  </span>
                </button>
              </div>
            </div>
          )}

          <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading} />

          <p className="text-center text-xs text-muted-foreground">
            {isLogin ? (
              <>
                No account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(false);
                    navigate('/auth?mode=signup', { replace: true });
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(true);
                    navigate('/auth?mode=login', { replace: true });
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Log in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
