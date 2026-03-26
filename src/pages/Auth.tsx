import { useState, useEffect, useCallback } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import { Briefcase, GraduationCap, ShieldCheck, ArrowLeft } from 'lucide-react';
import { isStudentEmail, STUDENT_EMAIL_HINT } from '@/lib/studentEmailValidator';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otp, setOtp] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  const redirectIfAlreadySignedIn = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('user_id', session.user.id)
      .maybeSingle();
    const done = !!(profile?.display_name?.trim() && profile?.avatar_url?.trim());
    navigate(done ? '/profile' : '/complete-profile', { replace: true });
  }, [navigate]);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'signup') setIsLogin(false);
    else if (mode === 'login') setIsLogin(true);
  }, []);

  useEffect(() => {
    void redirectIfAlreadySignedIn();
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
          toast({ title: 'Use your college email', description: STUDENT_EMAIL_HINT, variant: 'destructive' });
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName.trim() || email.split('@')[0], user_type: userType },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
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

      toast({ title: 'Account ready!', description: 'Add a photo and name on the next screen.' });
      navigate('/complete-profile', { replace: true });
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
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                  autoFocus
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify & continue'}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-border text-center">
              <button
                type="button"
                onClick={() => setPendingVerification(false)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                ← Back to create account
              </button>
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
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send reset link'}
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
            onClick={() => {
              setIsLogin(true);
              navigate('/auth?mode=login', { replace: true });
            }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
              isLogin ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              navigate('/auth?mode=signup', { replace: true });
            }}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-colors ${
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
                  <label className="block text-sm font-medium mb-2">I want to…</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setUserType('student')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        userType === 'student'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      <GraduationCap size={24} />
                      <span className="text-sm font-medium">Work as a freelancer</span>
                      <span className="text-[11px] opacity-80 text-center leading-tight">College email required</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserType('business')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        userType === 'business'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      <Briefcase size={24} />
                      <span className="text-sm font-medium">Hire & post gigs</span>
                      <span className="text-[11px] opacity-80 text-center leading-tight">Any email</span>
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
              className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Please wait…' : isLogin ? 'Log in' : 'Create account'}
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
