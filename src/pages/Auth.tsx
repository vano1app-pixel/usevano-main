import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import { Briefcase, GraduationCap, LogOut } from 'lucide-react';
import { isEmailVerified, rememberTalentBoardReturn, resolvePostAuthDestination } from '@/lib/authSession';
import { clearGoogleOAuthIntent, hasGoogleOAuthPending, setGoogleOAuthIntent } from '@/lib/googleOAuth';
import { cn } from '@/lib/utils';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { getGoogleOAuthRedirectUrl } from '@/lib/siteUrl';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { OnboardingJourney } from '@/components/OnboardingJourney';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [loading, setLoading] = useState(false);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [existingUserId, setExistingUserId] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const redirectIfAlreadySignedIn = useCallback(() => {
    if (hasGoogleOAuthPending()) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      subscription.unsubscribe();
      if (!session || !isEmailVerified(session)) return;
      // Instead of auto-redirecting, show the user who they're signed in as
      setExistingEmail(session.user.email || null);
      setExistingUserId(session.user.id);
    });
  }, []);

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
    redirectIfAlreadySignedIn();
  }, [redirectIfAlreadySignedIn]);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      setGoogleOAuthIntent(isLogin ? null : userType);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getGoogleOAuthRedirectUrl(),
          queryParams: { access_type: 'offline', prompt: 'consent select_account' },
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
    <div className="min-h-[100dvh] bg-background flex items-center justify-center px-4 py-10">
      <SEOHead
        title={`${isLogin ? 'Log in' : 'Create account'} – VANO`}
        description="Log in or sign up for VANO — local gigs and freelancers in Galway."
        noindex
      />
      <div className="w-full max-w-md">
        {!isLogin && <OnboardingJourney currentPage={1} className="mb-4" />}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <img src={logo} alt="VANO" className="h-11 w-11 rounded-xl shadow-tinted-sm" />
            <span className="text-[22px] font-bold tracking-tight text-primary">VANO</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isLogin ? 'Welcome back' : 'Join VANO'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
            {isLogin ? 'Sign in to your account.' : 'Pick your role and continue with Google.'}
          </p>
        </div>

        <div className="flex rounded-xl border border-border/60 bg-foreground/[0.02] p-1 mb-7">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsLogin(true);
              navigate('/auth?mode=login', { replace: true });
            }}
            className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
              isLogin ? 'bg-card text-foreground shadow-tinted-sm' : 'text-muted-foreground hover:text-foreground'
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
            className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-50 ${
              !isLogin ? 'bg-card text-foreground shadow-tinted-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create account
          </button>
        </div>

        {existingEmail && (
          <div className="mb-4 rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm text-foreground">
              You're signed in as <span className="font-semibold">{existingEmail}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  void resolvePostAuthDestination(existingUserId!).then((path) => navigate(path, { replace: true }));
                }}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90"
              >
                Continue as {existingEmail?.split('@')[0]}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await supabase.auth.signOut({ scope: 'global' });
                  Object.keys(localStorage).forEach((key) => {
                    if (key.startsWith('sb-') || key.includes('supabase')) {
                      localStorage.removeItem(key);
                    }
                  });
                  clearGoogleOAuthIntent();
                  setExistingEmail(null);
                  setExistingUserId(null);
                }}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:text-foreground hover:border-foreground/20"
              >
                <LogOut size={14} />
                Use a different account
              </button>
            </div>
          </div>
        )}

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-5">
          {!isLogin && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">I am a</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setUserType('student')}
                  className={cn(
                    'group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
                    userType === 'student'
                      ? 'border-emerald-500/50 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(16,185,129,0.1)]'
                      : 'border-foreground/[0.06] hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]',
                  )}
                >
                  <div className={cn(
                    'pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 transition-opacity duration-500',
                    userType === 'student' ? 'opacity-100' : 'group-hover:opacity-60',
                  )} />
                  <span className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300',
                    userType === 'student' ? 'bg-emerald-500/15' : 'bg-muted/60',
                  )}>
                    <GraduationCap className="text-emerald-600" size={20} strokeWidth={1.8} />
                  </span>
                  <div className="relative">
                    <span className="block text-[14px] font-semibold text-foreground">Freelancer</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                      Offer services &amp; build your portfolio
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setUserType('business')}
                  className={cn(
                    'group relative flex flex-col items-start gap-2.5 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]',
                    userType === 'business'
                      ? 'border-sky-500/50 bg-sky-500/[0.06] shadow-[0_0_0_1px_rgba(14,165,233,0.1)]'
                      : 'border-foreground/[0.06] hover:border-sky-500/30 hover:bg-sky-500/[0.03]',
                  )}
                >
                  <div className={cn(
                    'pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/10 to-transparent opacity-0 transition-opacity duration-500',
                    userType === 'business' ? 'opacity-100' : 'group-hover:opacity-60',
                  )} />
                  <span className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300',
                    userType === 'business' ? 'bg-sky-500/15' : 'bg-muted/60',
                  )}>
                    <Briefcase className="text-sky-600" size={20} strokeWidth={1.8} />
                  </span>
                  <div className="relative">
                    <span className="block text-[14px] font-semibold text-foreground">Business</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                      Find creative talent for your business
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}

          <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading} />

          {!isLogin && (
            <p className="text-center text-[11px] text-muted-foreground leading-relaxed">
              By signing up, you agree to our{' '}
              <Link to="/terms" className="text-primary hover:underline underline-offset-2">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" className="text-primary hover:underline underline-offset-2">Privacy Policy</Link>.
            </p>
          )}

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
