import React, { useState } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { createPortal } from 'react-dom';
import { X, ShieldCheck, GraduationCap, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { isStudentEmail, STUDENT_EMAIL_HINT } from '@/lib/studentEmailValidator';

interface AuthSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        // Validate student email
        if (userType === 'student' && !isStudentEmail(email)) {
          toast({ title: 'Invalid student email', description: STUDENT_EMAIL_HINT, variant: 'destructive' });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { user_type: userType }
          }
        });
        if (error) throw error;

        if (data.user) {
          await supabase.from('profiles').update({ user_type: userType }).eq('user_id', data.user.id);
          if (userType === 'student') {
            await supabase.from('student_profiles').insert({ user_id: data.user.id });
          }
        }

        setPendingVerification(true);
        toast({ title: 'Verification code sent!', description: `Check ${email} for a 6-digit code.` });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Welcome back!', description: 'You have successfully signed in.' });
        onClose();
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('user_id', session.user.id)
            .maybeSingle();
          const done = !!(profile?.display_name?.trim() && profile?.avatar_url?.trim());
          navigate(done ? '/profile' : '/complete-profile', { replace: true });
        }
      }
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
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
      toast({ title: 'Email verified!', description: 'Add your photo on the next screen.' });
      onClose();
      navigate('/complete-profile', { replace: true });
    } catch (error: any) {
      toast({ title: 'Verification failed', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: 'Enter your email first', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast({ title: 'Reset link sent!', description: `Check ${email} for a password reset link.` });
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[1000]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:max-w-md bg-background z-[1001] shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6 text-foreground/50 hover:text-foreground transition-colors z-10">
          <X size={24} />
        </button>

        <div className="flex flex-col h-full px-5 sm:px-8 pt-16 sm:pt-20 pb-6 sm:pb-8">
          {pendingVerification ? (
            <>
              <div className="text-center mb-6">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                  <ShieldCheck className="text-primary" size={28} />
                </div>
                <h2 className="text-2xl font-bold text-foreground">Check your inbox</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Enter the 6-digit code sent to<br />
                  <span className="font-medium text-foreground">{email}</span>
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full bg-background border border-input text-foreground rounded-lg px-4 py-3 text-2xl text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify Email'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button onClick={() => setPendingVerification(false)} className="text-muted-foreground hover:text-primary transition-colors text-sm">
                  ← Back to sign up
                </button>
              </div>
            </>
          ) : forgotPassword ? (
            <>
              <h2 className="text-3xl font-bold text-foreground mb-1">
                {resetSent ? 'Check your email' : 'Forgot password?'}
              </h2>
              <p className="text-muted-foreground text-sm mb-8">
                {resetSent
                  ? `We sent a reset link to ${email}`
                  : 'Enter your email and we\'ll send a reset link'}
              </p>

              {!resetSent ? (
                <form onSubmit={handleForgotPassword} className="flex flex-col gap-5">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-background border border-input text-foreground rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                      placeholder="your@email.com"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  Click the link in the email to set a new password. Check spam if you don't see it.
                </p>
              )}

              <div className="mt-6 text-center">
                <button
                  onClick={() => { setForgotPassword(false); setResetSent(false); }}
                  className="text-muted-foreground hover:text-primary transition-colors text-sm"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold text-foreground mb-1">
                {isSignUp ? 'Create Account' : 'Welcome Back'}
              </h2>
              <p className="text-muted-foreground text-sm mb-8">
                {isSignUp ? 'Join VANO to find shifts or hire students' : 'Sign in to your account'}
              </p>

              <form onSubmit={handleAuth} className="flex flex-col gap-5">
                {isSignUp && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">I am a</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setUserType('student')}
                        className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                          userType === 'student'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-foreground/60 hover:border-primary/30'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5"><GraduationCap size={16} /> Freelancer</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserType('business')}
                        className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                          userType === 'business'
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-foreground/60 hover:border-primary/30'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5"><Building2 size={16} /> Client</span>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-background border border-input text-foreground rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                    placeholder={isSignUp && userType === 'student' ? 'you@college.ie' : 'your@email.com'}
                  />
                  {isSignUp && userType === 'student' && (
                    <p className="text-xs text-muted-foreground mt-1.5">{STUDENT_EMAIL_HINT}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-background border border-input text-foreground rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                {!isSignUp && (
                  <div className="text-right -mt-2">
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
                  className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-muted-foreground hover:text-primary transition-colors text-sm"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};
