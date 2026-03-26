import React, { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, GraduationCap, Building2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import {
  isStudentEmail,
  STUDENT_EMAIL_HINT,
  FREELANCER_STUDENT_EMAIL_ERROR,
} from '@/lib/studentEmailValidator';
import { getPostAuthPath, isEmailVerified } from '@/lib/authSession';
import {
  clearGoogleOAuthIntent,
  hasGoogleOAuthPending,
  setGoogleOAuthIntent,
} from '@/lib/googleOAuth';
import { logSignUpResponse } from '@/lib/logSignUpResponse';
import { getGoogleOAuthRedirectUrl, getSiteOrigin } from '@/lib/siteUrl';
import { clearOtpContext, OTP_STORAGE, persistOtpContext } from '@/lib/authOtpStorage';
import { verifySignupOrEmailOtp } from '@/lib/verifyEmailOtp';
import { AuthMethodDivider, GoogleSignInButton } from '@/components/GoogleSignInButton';
import { cn } from '@/lib/utils';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

interface AuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const inputClass =
  'w-full bg-background border border-input text-foreground rounded-xl px-4 py-3.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-shadow';

export const AuthSheet: React.FC<AuthSheetProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otp, setOtp] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { toast } = useToast();

  // Logged-in + verified users should never stay on this sheet
  useEffect(() => {
    if (!isOpen) return;

    const redirectIfReady = async () => {
      if (hasGoogleOAuthPending()) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !isEmailVerified(session)) return;
      const path = await getPostAuthPath(session.user.id);
      onClose();
      navigate(path, { replace: true });
    };

    void redirectIfReady();
    const delayed = window.setTimeout(() => void redirectIfReady(), 700);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && isEmailVerified(session)) {
        void (async () => {
          const path = await getPostAuthPath(session.user.id);
          onClose();
          navigate(path, { replace: true });
        })();
      }
    });

    return () => {
      window.clearTimeout(delayed);
      subscription.unsubscribe();
    };
  }, [isOpen, navigate, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      const em = sessionStorage.getItem(OTP_STORAGE.email);
      if (em) {
        setEmail(em);
        const flow = sessionStorage.getItem(OTP_STORAGE.flow);
        if (flow === 'signup' || flow === 'login') {
          setPendingVerification(true);
          setIsSignUp(flow === 'signup');
        }
        const ut = sessionStorage.getItem(OTP_STORAGE.userType);
        if (ut === 'business' || ut === 'student') setUserType(ut);
      }
    } catch {
      /* ignore */
    }
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && !isEmailVerified(session)) {
        const addr = session.user.email ?? '';
        setEmail(addr);
        setPendingVerification(true);
        persistOtpContext({ email: addr, flow: 'login' });
      }
    })();
  }, [isOpen]);

  const handleGoogleSignIn = async () => {
    try {
      setGoogleOAuthIntent(isSignUp ? userType : null);
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
      toast({
        title: 'Google sign-in failed',
        description: getUserFriendlyError(error),
        variant: 'destructive',
      });
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      clearGoogleOAuthIntent();
      if (isSignUp) {
        if (userType === 'student' && !isStudentEmail(email)) {
          toast({
            title: 'Student email required',
            description: `${FREELANCER_STUDENT_EMAIL_ERROR} ${STUDENT_EMAIL_HINT}`,
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        const signUpResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { user_type: userType },
            emailRedirectTo: undefined,
          },
        });
        logSignUpResponse(signUpResult);
        const { data, error } = signUpResult;
        if (error) throw error;

        if (data.user) {
          await supabase.from('profiles').upsert(
            {
              user_id: data.user.id,
              user_type: userType,
              display_name: email.split('@')[0] || 'User',
            },
            { onConflict: 'user_id' },
          );
          if (userType === 'student') {
            await supabase.from('student_profiles').upsert({ user_id: data.user.id }, { onConflict: 'user_id' });
          }
        }

        setPendingVerification(true);
        persistOtpContext({
          email,
          flow: 'signup',
          userType,
          displayName: email.split('@')[0] || 'User',
        });
        toast({
          title: 'Check your email',
          description: `Code sent only to ${email} (check spam). Type it below — ignore the link in the email if you want to stay here.`,
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const em = error.message?.toLowerCase() ?? '';
          if (em.includes('email not confirmed') || em.includes('email_not_confirmed')) {
            setPendingVerification(true);
            persistOtpContext({ email, flow: 'login' });
            toast({ title: 'Verify your email', description: 'Enter the 6-digit code from your email.' });
            return;
          }
          throw error;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (session && !isEmailVerified(session)) {
          setPendingVerification(true);
          persistOtpContext({ email, flow: 'login' });
          toast({ title: 'Verify your email', description: 'Enter the 6-digit code from your email.' });
          return;
        }
        toast({ title: 'Welcome back!', description: 'Signed in successfully.' });
        onClose();
        if (session && isEmailVerified(session)) {
          const path = await getPostAuthPath(session.user.id);
          navigate(path, { replace: true });
        }
      }
    } catch (error: unknown) {
      toast({ title: 'Something went wrong', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error: verifyErr } = await verifySignupOrEmailOtp(supabase, {
        email: email.trim(),
        token: otp,
      });
      if (verifyErr) throw verifyErr;
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s) await supabase.auth.refreshSession();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.email?.split('@')[0] || 'User';
        const { data: row } = await supabase.from('profiles').select('user_id, user_type').eq('user_id', user.id).maybeSingle();
        const metaType = (user.user_metadata?.user_type as string | undefined) || userType;
        const resolvedType = row?.user_type || (metaType === 'business' ? 'business' : 'student');
        if (row) {
          await supabase.from('profiles').update({ display_name: name }).eq('user_id', user.id);
        } else {
          await supabase.from('profiles').insert({
            user_id: user.id,
            display_name: name,
            user_type: resolvedType,
          });
        }
        if (resolvedType === 'student') {
          await supabase.from('student_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id' });
        }
      }
      const nextPath = user ? await getPostAuthPath(user.id) : '/complete-profile';
      const { data: prof } = user
        ? await supabase.from('profiles').select('user_type').eq('user_id', user.id).maybeSingle()
        : { data: null };
      const isBusiness = prof?.user_type === 'business';
      clearOtpContext();
      toast({
        title: "You're in!",
        description: isBusiness ? 'Welcome — opening your dashboard.' : 'Next: add your name and photo.',
      });
      onClose();
      navigate(nextPath, { replace: true });
    } catch (error: unknown) {
      toast({ title: 'Verification failed', description: getUserFriendlyError(error), variant: 'destructive' });
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
      toast({ title: 'Could not resend', description: getUserFriendlyError(error), variant: 'destructive' });
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getSiteOrigin()}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast({ title: 'Email sent', description: `Check ${email} for a reset link.` });
    } catch (error: unknown) {
      toast({ title: 'Couldn’t send email', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[1000] backdrop-blur-[2px]"
        onClick={loading ? undefined : onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[1001] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          className={cn(
            'pointer-events-auto w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto',
            'bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-xl',
            'safe-area-bottom',
          )}
        >
          <div className="sticky top-0 flex items-center justify-between px-4 pt-4 pb-2 sm:px-6 sm:pt-5 bg-card/95 backdrop-blur-sm border-b border-border/60 z-10">
            <p className="text-sm font-semibold tracking-tight text-foreground">VANO</p>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X size={22} />
            </button>
          </div>

          <div className="px-4 pb-8 pt-4 sm:px-6 sm:pb-8 sm:pt-5">
            {pendingVerification ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <ShieldCheck className="text-primary" size={26} />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Enter your code</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    We emailed a 6-digit code to{' '}
                    <span className="font-medium text-foreground">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-center text-muted-foreground uppercase tracking-wide">
                      6-digit code
                    </p>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={6}
                        value={otp}
                        onChange={(value) => setOtp(value.replace(/\D/g, ''))}
                        disabled={loading}
                        containerClassName="gap-2"
                        autoComplete="one-time-code"
                      >
                        <InputOTPGroup className="gap-1.5">
                          <InputOTPSlot index={0} className="h-11 w-9 text-base rounded-lg" />
                          <InputOTPSlot index={1} className="h-11 w-9 text-base rounded-lg" />
                          <InputOTPSlot index={2} className="h-11 w-9 text-base rounded-lg" />
                          <InputOTPSlot index={3} className="h-11 w-9 text-base rounded-lg" />
                          <InputOTPSlot index={4} className="h-11 w-9 text-base rounded-lg" />
                          <InputOTPSlot index={5} className="h-11 w-9 text-base rounded-lg" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <p className="text-[11px] text-center text-muted-foreground leading-snug px-1">
                      Enter the code from your email — verification happens here, no redirect link.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || otp.length < 6}
                    className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary text-primary-foreground font-medium text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
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

                <div className="space-y-3 text-center">
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
                        clearOtpContext();
                        setPendingVerification(false);
                      }}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              </div>
            ) : forgotPassword ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {resetSent ? 'Check your inbox' : 'Reset password'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {resetSent
                      ? `We sent a link to ${email}`
                      : 'We’ll email you a link to set a new password.'}
                  </p>
                </div>

                {!resetSent ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className={inputClass}
                        placeholder="you@example.com"
                        autoFocus
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary text-primary-foreground font-medium text-[15px] hover:bg-primary/90 disabled:opacity-50"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          Sending…
                        </>
                      ) : (
                        'Send link'
                      )}
                    </button>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground text-center leading-relaxed">
                    Open the email and follow the link. Then return here to log in.
                  </p>
                )}

                <div className="text-center">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setForgotPassword(false);
                      setResetSent(false);
                    }}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {isSignUp ? 'Create account' : 'Welcome back'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {isSignUp
                      ? 'Pick Freelancer or Business, then continue with Google (fastest) or email.'
                      : 'Continue with Google, or use email and password below.'}
                  </p>
                </div>

                {isSignUp && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account type</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setUserType('student')}
                        disabled={loading}
                        className={cn(
                          'rounded-xl border-2 px-4 py-4 text-left transition-all min-h-[88px] flex flex-col gap-1',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          userType === 'student'
                            ? 'border-emerald-500/70 bg-emerald-500/[0.07] shadow-sm'
                            : 'border-border bg-muted/30 hover:border-emerald-500/25',
                        )}
                      >
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                          <GraduationCap className="text-emerald-600 shrink-0" size={18} />
                          Freelancer
                        </span>
                        <span className="text-xs text-muted-foreground leading-snug">
                          Student email required (.ac.ie, .atu.ie, etc.)
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserType('business')}
                        disabled={loading}
                        className={cn(
                          'rounded-xl border-2 px-4 py-4 text-left transition-all min-h-[88px] flex flex-col gap-1',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          userType === 'business'
                            ? 'border-sky-500/70 bg-sky-500/[0.07] shadow-sm'
                            : 'border-border bg-muted/30 hover:border-sky-500/25',
                        )}
                      >
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                          <Building2 className="text-sky-600 shrink-0" size={18} />
                          Business
                        </span>
                        <span className="text-xs text-muted-foreground leading-snug">
                          Post gigs & hire students — any email
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <GoogleSignInButton onClick={handleGoogleSignIn} disabled={loading} />
                <AuthMethodDivider />

                <form onSubmit={handleAuth} className="space-y-5">
                  <div className="space-y-1.5">
                    <label htmlFor="sheet-email" className="text-sm font-medium text-foreground">
                      Email
                    </label>
                    <input
                      id="sheet-email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading}
                      className={inputClass}
                      placeholder={isSignUp && userType === 'student' ? 'you@university.ie' : 'you@example.com'}
                      autoComplete="email"
                    />
                    {isSignUp && userType === 'student' && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{STUDENT_EMAIL_HINT}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="sheet-password" className="text-sm font-medium text-foreground">
                      Password
                    </label>
                    <input
                      id="sheet-password"
                      name="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      disabled={loading}
                      className={inputClass}
                      placeholder="At least 6 characters"
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    />
                  </div>

                  {!isSignUp && (
                    <div className="flex justify-end -mt-1">
                      <button
                        type="button"
                        onClick={() => setForgotPassword(true)}
                        disabled={loading}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-border bg-muted/80 text-foreground font-medium text-[15px] hover:bg-muted transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Please wait…
                      </>
                    ) : isSignUp ? (
                      'Create account with email'
                    ) : (
                      'Sign in with email'
                    )}
                  </button>
                </form>

                <p className="text-center text-sm text-muted-foreground">
                  {isSignUp ? (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setIsSignUp(false)}
                        className="font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        Sign in
                      </button>
                    </>
                  ) : (
                    <>
                      New to VANO?{' '}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setIsSignUp(true)}
                        className="font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
