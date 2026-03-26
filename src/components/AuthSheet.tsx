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
import { cn } from '@/lib/utils';

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
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { toast } = useToast();

  // Logged-in + verified users should never stay on this sheet
  useEffect(() => {
    if (!isOpen) return;

    const redirectIfReady = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !isEmailVerified(session)) return;
      const path = await getPostAuthPath(session.user.id);
      onClose();
      navigate(path, { replace: true });
    };

    void redirectIfReady();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && isEmailVerified(session)) {
        void (async () => {
          const path = await getPostAuthPath(session.user.id);
          onClose();
          navigate(path, { replace: true });
        })();
      }
    });

    return () => subscription.unsubscribe();
  }, [isOpen, navigate, onClose]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
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

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: { user_type: userType },
          },
        });
        if (error) throw error;

        if (data.user) {
          await supabase.from('profiles').update({ user_type: userType }).eq('user_id', data.user.id);
          if (userType === 'student') {
            await supabase.from('student_profiles').insert({ user_id: data.user.id });
          }
        }

        setPendingVerification(true);
        toast({ title: 'Check your email', description: `We sent a 6-digit code to ${email}.` });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Welcome back!', description: 'Signed in successfully.' });
        onClose();
        const { data: { session } } = await supabase.auth.getSession();
        if (session && isEmailVerified(session)) {
          const path = await getPostAuthPath(session.user.id);
          navigate(path, { replace: true });
        } else if (session) {
          navigate('/auth', { replace: true });
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
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'signup' });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.email?.split('@')[0] || 'User';
        const { data: row } = await supabase.from('profiles').select('user_id').eq('user_id', user.id).maybeSingle();
        if (row) {
          await supabase.from('profiles').update({ user_type: userType, display_name: name }).eq('user_id', user.id);
        } else {
          await supabase.from('profiles').insert({ user_id: user.id, display_name: name, user_type: userType });
        }
        if (userType === 'student') {
          await supabase.from('student_profiles').upsert({ user_id: user.id }, { onConflict: 'user_id' });
        }
      }
      toast({ title: "You're in!", description: 'Add your photo on the next screen.' });
      onClose();
      navigate('/complete-profile', { replace: true });
    } catch (error: unknown) {
      toast({ title: 'Verification failed', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
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
        redirectTo: `${window.location.origin}/reset-password`,
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

                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    className={`${inputClass} text-center text-2xl tracking-[0.4em] font-mono`}
                    autoFocus
                    disabled={loading}
                  />
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

                <div className="text-center">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setPendingVerification(false)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                  >
                    ← Back
                  </button>
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
                      ? 'Choose how you’ll use VANO, then enter your details.'
                      : 'Sign in with your email and password.'}
                  </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-5">
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

                  <div className="space-y-1.5">
                    <label htmlFor="sheet-email" className="text-sm font-medium text-foreground">
                      Email
                    </label>
                    <input
                      id="sheet-email"
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
                    className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-primary text-primary-foreground font-medium text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Please wait…
                      </>
                    ) : isSignUp ? (
                      'Create account'
                    ) : (
                      'Sign in'
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
