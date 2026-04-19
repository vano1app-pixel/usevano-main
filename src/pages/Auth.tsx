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
import { getAuthRedirectUrl } from '@/lib/siteUrl';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { LiveMatchesCounter } from '@/components/LiveMatchesCounter';
import { isInAppBrowser } from '@/lib/inAppBrowser';
import { track } from '@/lib/track';
import { sendMagicLink } from '@/lib/magicLink';
import { Mail, Loader2, Check as CheckIcon } from 'lucide-react';

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  // Default to business because the site's primary growth lever is
  // hirer signups: most cold visitors land here from hirer-facing
  // campaigns, and every hire funds the Vano Match + Vano Pay revenue
  // paths. Freelancers can still tap the toggle — one extra click for
  // the minority audience, heading matches the majority on first paint.
  const [userType, setUserType] = useState<'student' | 'business'>('business');
  const [loading, setLoading] = useState(false);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [existingUserId, setExistingUserId] = useState<string | null>(null);
  // Magic-link state. `magicLinkSent` flips once Supabase accepts the send —
  // we swap the form for a "Check your email" confirmation until the user
  // clicks the link and lands back on Landing, which runs
  // tryFinishMagicLinkRedirect() to finalise the sign-in.
  const [magicLinkEmail, setMagicLinkEmail] = useState('');
  const [magicLinkSending, setMagicLinkSending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  // Resend cooldown — prevents accidental spam and gives users feedback that
  // their first click registered. 30s matches Supabase's per-email throttle.
  const [resendCooldown, setResendCooldown] = useState(0);

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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (magicLinkSending) return;
    setMagicLinkSending(true);
    const result = await sendMagicLink(
      magicLinkEmail,
      isLogin ? null : userType,
      isLogin,
    );
    setMagicLinkSending(false);
    if (!result.ok) {
      toast({
        title: 'Could not send link',
        description: result.message,
        variant: 'destructive',
      });
      return;
    }
    setMagicLinkSent(true);
    setResendCooldown(30);
    track('auth_magic_link_sent', {
      mode: isLogin ? 'login' : 'signup',
      user_type: isLogin ? null : userType,
    });
  };

  const handleResendMagicLink = async () => {
    if (resendCooldown > 0 || magicLinkSending || !magicLinkEmail) return;
    setMagicLinkSending(true);
    const result = await sendMagicLink(
      magicLinkEmail,
      isLogin ? null : userType,
      isLogin,
    );
    setMagicLinkSending(false);
    if (!result.ok) {
      toast({
        title: 'Could not resend link',
        description: result.message,
        variant: 'destructive',
      });
      return;
    }
    setResendCooldown(30);
    toast({ title: 'Sent again', description: `A fresh link is on its way to ${magicLinkEmail}.` });
    track('auth_magic_link_resent', {
      mode: isLogin ? 'login' : 'signup',
      user_type: isLogin ? null : userType,
    });
  };

  const handleGoogleSignIn = async () => {
    // Google OAuth is blocked inside in-app browsers (Fiverr, Instagram,
    // TikTok, …) with a 403 "disallowed_useragent" page. Intercept before
    // the redirect so the user gets a readable message instead of a cryptic
    // Google error. The banner at the top has the "Open in Safari" escape.
    if (isInAppBrowser()) {
      track('in_app_browser_blocked', { source: 'auth_google_button' });
      toast({
        title: "Can't sign in here",
        description: "Open this page in Safari or Chrome first — see the banner at the top.",
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      setGoogleOAuthIntent(isLogin ? null : userType);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(),
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
        description="Log in or sign up for VANO — gigs and trusted freelancers."
        noindex
      />
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-5">
            <img src={logo} alt="VANO" className="h-11 w-11 rounded-xl shadow-tinted-sm" />
            <span className="text-[22px] font-bold tracking-tight text-primary">VANO</span>
          </div>
          {/* Headline swaps with the role toggle below — business viewers
              land on the hirer value prop ("tailored to you"), freelancers
              get their own sign-up pitch. Signup state ties heading copy
              to the same `userType` that drives the Google/magic-link
              intent, so the heading always matches what the user is about
              to sign up for. Login mode is role-agnostic. */}
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isLogin
              ? 'Welcome back'
              : userType === 'business'
              ? 'Match me with a freelancer for €1'
              : 'Get hired by local businesses'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
            {isLogin
              ? 'Sign in to your account.'
              : userType === 'business'
              ? "Pay €1, meet your match in 60 seconds, chat + pay them securely through Vano. Refunded if we don't find one."
              : 'Sign in to list yourself — 30 seconds to get in front of businesses hiring right now.'}
          </p>
          {/* Social-proof chip — auto-hides when the public match count is
              too small to be reassuring (< 3). Signup-only; login-return
              users don't need the reminder. */}
          {!isLogin && (
            <div className="mt-3 flex justify-center">
              <LiveMatchesCounter />
            </div>
          )}
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
              <p id="role-toggle-label" className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">I am a</p>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-labelledby="role-toggle-label">
                <button
                  type="button"
                  role="radio"
                  aria-checked={userType === 'student'}
                  aria-label="Sign up as a freelancer"
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
                  role="radio"
                  aria-checked={userType === 'business'}
                  aria-label="Sign up as a business"
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

          {/* Magic-link alternative. Critical for users who land inside an
              embedded in-app browser (Fiverr / Instagram / TikTok) where
              Google OAuth is blocked by Google with a 403. The magic link
              opens in their email app and can be clicked from any real
              browser. Also: anyone who doesn't use Google. */}
          {magicLinkSent ? (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
                <CheckIcon size={14} strokeWidth={2.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Check your email</p>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                  We sent a magic link to <span className="font-medium text-foreground">{magicLinkEmail}</span>. Click it on any device to finish signing {isLogin ? 'in' : 'up'}.
                </p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                  Didn&apos;t get it? Check spam, then resend.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleResendMagicLink}
                    disabled={resendCooldown > 0 || magicLinkSending}
                    className="text-[11px] font-semibold text-primary hover:underline underline-offset-2 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                  >
                    {magicLinkSending
                      ? 'Resending…'
                      : resendCooldown > 0
                      ? `Resend in ${resendCooldown}s`
                      : 'Resend link'}
                  </button>
                  <span aria-hidden className="text-muted-foreground/50">·</span>
                  <button
                    type="button"
                    onClick={() => { setMagicLinkSent(false); setMagicLinkEmail(''); setResendCooldown(0); }}
                    className="text-[11px] font-semibold text-primary hover:underline underline-offset-2"
                  >
                    Use a different email
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  or with email
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form onSubmit={handleMagicLink} className="space-y-2">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary/40">
                  <Mail size={16} className="shrink-0 text-muted-foreground" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={magicLinkEmail}
                    onChange={(e) => setMagicLinkEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={magicLinkSending}
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={magicLinkSending || magicLinkEmail.trim().length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {magicLinkSending ? (
                    <><Loader2 size={14} className="animate-spin" /> Sending link…</>
                  ) : (
                    <>{isLogin ? 'Email me a sign-in link' : 'Email me a sign-up link'}</>
                  )}
                </button>
                <p className="text-center text-[10.5px] text-muted-foreground/80">
                  No password. We email a one-tap link. Works in Safari, Chrome, any browser.
                </p>
              </form>
            </>
          )}

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
