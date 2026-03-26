import { useState, useEffect, useCallback } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import { Briefcase, GraduationCap, ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';
import {
  isStudentEmail,
  STUDENT_EMAIL_HINT,
  FREELANCER_STUDENT_EMAIL_ERROR,
} from '@/lib/studentEmailValidator';
import { getPostAuthPath, isEmailVerified } from '@/lib/authSession';
import { cn } from '@/lib/utils';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { logSignUpResponse } from '@/lib/logSignUpResponse';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  const redirectIfAlreadySignedIn = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !isEmailVerified(session)) return;
    const path = await getPostAuthPath(session.user.id);
    navigate(path, { replace: true });
  }, [navigate]);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'signup') setIsLogin(false);
    else if (mode === 'login') setIsLogin(true);
  }, []);

  useEffect(() => {
    void redirectIfAlreadySignedIn();
    // Recovery / OAuth may still set session from URL; re-check when auth state changes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void redirectIfAlreadySignedIn();
    });
    return () => subscription.unsubscribe();
  }, [redirectIfAlreadySignedIn]);

  const ensureProfileAfterSignUp = async (userId: string) => {
    const name = displayName.trim() || email.split('@')[0] || 'User';
    const { data: existing } = await supabase.from('profiles').select('user_id').eq('user_id', userId).maybeSingle();
    if (existing) {
      await supabase
        .from('profiles')
        .update({ user_type: userType, display_name: name })
        .eq('user_id', userId);
    } else {
      await supabase.from('profiles').insert({
        user_id: userId,
        display_name: name,
        user_type: userType,
      });
    }
    if (userType === 'student') {
      await supabase.from('student_profiles').upsert({ user_id: userId }, { onConflict: 'user_id' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Welcome back!', description: 'Signed in successfully.' });
        await redirectIfAlreadySignedIn();
      } else {
        if (userType === 'student' && !isStudentEmail(email)) {
          toast({
            title: 'Student email required',
            description: FREELANCER_STUDENT_EMAIL_ERROR + ' ' + STUDENT_EMAIL_HINT,
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
        const signUpResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0], user_type: userType },
            emailRedirectTo: undefined,
          },
        });
        logSignUpResponse(signUpResult);
        const { error } = signUpResult;
        if (error) throw error;

        setPendingVerification(true);
        toast({
          title: 'Check your email',
          description: `We sent a 6-digit code to ${email}. Enter it below to finish creating your account.`,
        });
      }
    } catch (error: unknown) {
      toast({
        title: 'Something went wrong',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await ensureProfileAfterSignUp(user.id);

      const nextPath = user ? await getPostAuthPath(user.id) : '/complete-profile';
      const isBusiness = userType === 'business';
      toast({
        title: 'You’re verified!',
        description: isBusiness
          ? 'Welcome — taking you to your dashboard.'
          : 'Next, add your name and photo to finish your profile.',
      });
      navigate(nextPath, { replace: true });
    } catch (error: unknown) {
      toast({
        title: 'Verification failed',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (!email.trim()) return;
    setResendLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
      if (error) throw error;
      toast({ title: 'Code sent', description: 'Check your inbox for a new 6-digit code.' });
    } catch (error: unknown) {
      toast({
        title: 'Could not resend',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setResendLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: 'Enter your email', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast({
        title: 'Email sent',
        description: 'Open the link in the email to set a new password. Check spam if you don’t see it.',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring';

  if (pendingVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <SEOHead title="Verify Email – VANO" description="Enter your verification code" />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="text-primary" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Enter your code</h1>
            <p className="text-sm text-muted-foreground mt-2">
              We sent a 6-digit code to<br />
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-center text-foreground">Enter the 6-digit code</label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value.replace(/\D/g, ''))}
                    disabled={loading}
                    containerClassName="gap-2 sm:gap-3"
                  >
                    <InputOTPGroup className="gap-1.5 sm:gap-2">
                      <InputOTPSlot index={0} className="h-12 w-10 sm:h-14 sm:w-11 text-lg rounded-lg" />
                      <InputOTPSlot index={1} className="h-12 w-10 sm:h-14 sm:w-11 text-lg rounded-lg" />
                      <InputOTPSlot index={2} className="h-12 w-10 sm:h-14 sm:w-11 text-lg rounded-lg" />
                      <InputOTPSlot index={3} className="h-12 w-10 sm:h-14 sm:w-11 text-lg rounded-lg" />
                      <InputOTPSlot index={4} className="h-12 w-10 sm:h-14 sm:w-11 text-lg rounded-lg" />
                      <InputOTPSlot index={5} className="h-12 w-10 sm:h-14 sm:w-11 text-lg rounded-lg" />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  No link to click — enter the code from your email here.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2 min-h-[48px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Verifying…
                  </>
                ) : (
                  'Verify & continue'
                )}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-border space-y-3 text-center">
              <button
                type="button"
                disabled={resendLoading || loading}
                onClick={() => void handleResendSignupCode()}
                className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                {resendLoading ? 'Sending…' : 'Resend code'}
              </button>
              <div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setOtp('');
                    setPendingVerification(false);
                  }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  ← Back to create account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (forgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <SEOHead title="Forgot Password – VANO" description="Reset your VANO password" />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
              <span className="text-2xl font-bold text-primary">VANO</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {resetSent ? 'Check your inbox' : 'Reset password'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {resetSent ? (
                <>
                  We emailed <span className="font-medium text-foreground">{email}</span> with a link to set a new
                  password.
                </>
              ) : (
                'Enter the email you use for VANO and we’ll send you a secure link.'
              )}
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
            {!resetSent ? (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className={inputClass}
                    autoFocus
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Sending…
                    </>
                  ) : (
                    'Send reset link'
                  )}
                </button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                After you set a new password, return here and use <strong>Log in</strong> with your email and new
                password.
              </p>
            )}

            <div className="mt-5 pt-5 border-t border-border text-center">
              <button
                type="button"
                onClick={() => {
                  setForgotPassword(false);
                  setResetSent(false);
                }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft size={14} /> Back to log in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            {isLogin ? 'Log in to VANO' : 'Create your account'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
            {isLogin
              ? 'Use the email and password you signed up with.'
              : 'Freelancers need a valid college email. Hiring accounts can use any email.'}
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

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">Account type</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setUserType('student')}
                      className={cn(
                        'flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-all text-left min-h-[100px]',
                        userType === 'student'
                          ? 'border-emerald-500/70 bg-emerald-500/[0.07] shadow-sm'
                          : 'border-border text-muted-foreground hover:border-emerald-500/25',
                      )}
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <GraduationCap className="text-emerald-600 shrink-0" size={22} />
                        Freelancer
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        Student email (.ac.ie, .atu.ie, …)
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setUserType('business')}
                      className={cn(
                        'flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 transition-all text-left min-h-[100px]',
                        userType === 'business'
                          ? 'border-sky-500/70 bg-sky-500/[0.07] shadow-sm'
                          : 'border-border text-muted-foreground hover:border-sky-500/25',
                      )}
                    >
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Briefcase className="text-sky-600 shrink-0" size={22} />
                        Business
                      </span>
                      <span className="text-[11px] text-muted-foreground leading-tight">Post gigs — any email</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Display name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={userType === 'business' ? 'Your name or company' : 'Your name'}
                  className={inputClass}
                  disabled={loading}
                />
                  {userType === 'student' && (
                    <p className="text-xs text-muted-foreground mt-1.5">{STUDENT_EMAIL_HINT}</p>
                  )}
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder={!isLogin && userType === 'student' ? 'you@university.ie' : 'you@example.com'}
                className={inputClass}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder="At least 6 characters"
                minLength={6}
                className={inputClass}
                disabled={loading}
              />
            </div>

            {isLogin && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setForgotPassword(true)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2 min-h-[48px]"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Please wait…
                </>
              ) : isLogin ? (
                'Log in'
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-5 pt-5 border-t border-border text-center text-xs text-muted-foreground leading-relaxed">
            {isLogin ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(false);
                    navigate('/auth?mode=signup', { replace: true });
                  }}
                  className="font-medium text-primary hover:underline"
                >
                  Create an account
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
                  Log in instead
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
