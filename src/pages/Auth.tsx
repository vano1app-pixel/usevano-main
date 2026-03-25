import { useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import { Briefcase, GraduationCap, ShieldCheck, ArrowLeft } from 'lucide-react';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userType, setUserType] = useState<'student' | 'business'>('student');
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);
  const [otp, setOtp] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [forgotPassword, setForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'signup') setIsLogin(false);
    else if (mode === 'login') setIsLogin(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/dashboard');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        if (!isLogin) {
          await supabase.from('profiles').update({
            user_type: userType,
            display_name: displayName || email.split('@')[0],
          }).eq('user_id', session.user.id);

          if (userType === 'student') {
            await supabase.from('student_profiles').upsert({
              user_id: session.user.id,
            } as any);
          }
        }
        navigate('/complete-profile');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, isLogin, userType, displayName, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast({ title: 'Welcome back!', description: 'Signed in successfully' });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split('@')[0] },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;

        setPendingVerification(true);
        toast({
          title: 'Verification code sent!',
          description: `We've sent a 6-digit code to ${email}`,
        });
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
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'signup',
      });
      if (error) throw error;
      toast({ title: 'Email verified!', description: 'Welcome to VANO 🎉' });
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
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      setResetSent(true);
      toast({ title: 'Reset code sent!', description: `Check ${email} for a 6-digit code.` });
    } catch (error: any) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: resetOtp,
        type: 'recovery',
      });
      if (error) throw error;
      toast({ title: 'Code verified!', description: 'Set your new password.' });
      navigate('/reset-password');
    } catch (error: any) {
      toast({ title: 'Verification failed', description: getUserFriendlyError(error), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  // ── OTP verification screen ──
  if (pendingVerification) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <SEOHead title="Verify Email – VANO" description="Enter your verification code" />
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="text-primary" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Check your inbox</h1>
            <p className="text-sm text-muted-foreground mt-2">
              We sent a 6-digit verification code to<br />
              <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5">Verification Code</label>
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
                {loading ? 'Verifying...' : 'Verify Email'}
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-border text-center">
              <button
                onClick={() => setPendingVerification(false)}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                ← Back to sign up
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Forgot password screen ──
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
              {resetSent ? 'Enter reset code' : 'Forgot password?'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {resetSent
                ? <>We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span></>
                : 'No worries — enter your email and we\'ll send a reset code'}
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
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyResetOtp} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Verification Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono`}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || resetOtp.length < 6}
                  className="w-full py-3.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
              </form>
            )}

            <div className="mt-5 pt-5 border-t border-border text-center">
              <button
                onClick={() => { setForgotPassword(false); setResetSent(false); setResetOtp(''); }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mx-auto"
              >
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main auth form ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <SEOHead
        title={`${isLogin ? 'Sign In' : 'Sign Up'} – VANO`}
        description={isLogin ? 'Sign in to your VANO account' : 'Create your VANO account to find or post shifts'}
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="VANO" className="h-10 w-10 rounded-xl" />
            <span className="text-2xl font-bold text-primary">VANO</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin ? 'Sign in to manage your shifts' : 'Get started — it\'s free'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">I am a...</label>
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
                      <span className="text-sm font-medium">Student</span>
                      <span className="text-xs opacity-70">Looking for shifts</span>
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
                      <span className="text-sm font-medium">Business</span>
                      <span className="text-xs opacity-70">Posting shifts</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={userType === 'business' ? 'Business name' : 'Your name'}
                    className={inputClass}
                  />
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
                placeholder="you@example.com"
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
                placeholder="••••••••"
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
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-border text-center">
            <button
              type="button"
              onClick={() => {
                const nextLogin = !isLogin;
                setIsLogin(nextLogin);
                navigate(nextLogin ? '/auth?mode=login' : '/auth?mode=signup', { replace: true });
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
