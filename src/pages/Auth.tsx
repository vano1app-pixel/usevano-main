import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { SEOHead } from '@/components/SEOHead';
import { signOutCleanly } from '@/lib/signOut';
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
  const queryClient = useQueryClient();
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

  // Client-side email shape check so the submit button stays disabled on
  // obvious gibberish ("asdf", "foo@bar"). Server does the real validation
  // via Supabase signInWithOtp, but failing fast in the UI means the user
  // doesn't tap a disabled-looking button, wait for the round-trip, and
  // then see a generic toast. Deliberately permissive — anything with an
  // '@' and a dot after it passes. Supabase is strict downstream.
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(magicLinkEmail.trim());

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
          queryParams: { access_type: 'offline', prompt: 'select_account' },
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
    <div className="relative min-h-[100dvh] overflow-hidden bg-background flex items-center justify-center px-4 py-12">
      <SEOHead
        title={`${isLogin ? 'Log in' : 'Create account'} – VANO`}
        description="Log in or sign up for VANO — gigs and trusted freelancers."
        noindex
      />
      {/* Ambient primary-tinted blob — matches the premium gradient
          treatment on Landing hero + pick cards so Auth reads as part of
          the same product, not a detached form page. */}
      <div className="pointer-events-none absolute left-1/2 top-1/3 -z-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.08] blur-[100px]" />
      <div className="pointer-events-none absolute right-[-120px] bottom-[-140px] -z-0 h-[360px] w-[360px] rounded-full bg-emerald-500/[0.06] blur-[90px]" />

      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-7 text-center">
          <div className="mb-5 flex items-center justify-center">
            <img src={logo} alt="VANO" className="h-14 w-14 rounded-2xl shadow-[0_12px_28px_-12px_hsl(var(--primary)/0.35)]" />
          </div>
          {/* Headline swaps with the role toggle below — business viewers
              land on the hirer value prop, freelancers get their own
              sign-up pitch. Signup state ties heading copy to the same
              `userType` that drives the Google/magic-link intent. Login
              mode is role-agnostic. */}
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight text-foreground text-balance sm:text-[32px]">
            {isLogin
              ? 'Welcome back'
              : userType === 'business'
              ? 'A perfect freelancer for €1'
              : 'Get hired by local businesses'}
          </h1>
          <p className="mx-auto mt-2 max-w-[34ch] text-[14px] leading-relaxed text-muted-foreground">
            {isLogin
              ? 'Sign in to pick up where you left off.'
              : userType === 'business'
              ? 'AI match in 20 seconds, or free hand-picked in 24h. Chat, agree a rate, pay them directly.'
              : "30 seconds to get in front of businesses hiring right now."}
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

        <div className="mb-5 flex rounded-full border border-border/70 bg-foreground/[0.025] p-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsLogin(true);
              navigate('/auth?mode=login', { replace: true });
            }}
            className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-all duration-200 disabled:opacity-50 ${
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
            className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition-all duration-200 disabled:opacity-50 ${
              !isLogin ? 'bg-card text-foreground shadow-tinted-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Create account
          </button>
        </div>

        {existingEmail && (
          <div className="mb-4 rounded-[20px] border border-border/70 bg-card/80 p-5 backdrop-blur-sm shadow-[0_18px_44px_-24px_rgba(0,0,0,0.18)] space-y-3">
            <p className="text-sm text-foreground">
              You're signed in as <span className="font-semibold">{existingEmail}</span>
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  void resolvePostAuthDestination(existingUserId!).then((path) => navigate(path, { replace: true }));
                }}
                className="flex-1 rounded-2xl bg-primary px-4 py-3 text-[14px] font-semibold text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.5)] transition-all duration-150 hover:-translate-y-[1px] hover:brightness-[1.05] active:translate-y-0 active:scale-[0.99]"
              >
                Continue as {existingEmail?.split('@')?.[0] ?? 'user'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOutCleanly(queryClient);
                  setExistingEmail(null);
                  setExistingUserId(null);
                }}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/70 px-4 py-3 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:text-foreground hover:border-foreground/25"
              >
                <LogOut size={14} />
                Use a different account
              </button>
            </div>
          </div>
        )}

        <div className="rounded-[20px] border border-border/70 bg-card/80 p-6 backdrop-blur-sm shadow-[0_18px_44px_-24px_rgba(0,0,0,0.2)] space-y-5 md:p-7">
          {!isLogin && (
            <div>
              <p id="role-toggle-label" className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">I am a</p>
              <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby="role-toggle-label">
                <button
                  type="button"
                  role="radio"
                  aria-checked={userType === 'student'}
                  aria-label="Sign up as a freelancer"
                  disabled={loading}
                  onClick={() => setUserType('student')}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.98]',
                    userType === 'student'
                      ? 'border-emerald-500/55 bg-emerald-500/[0.08] shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]'
                      : 'border-border/60 hover:border-emerald-500/35 hover:bg-emerald-500/[0.03]',
                  )}
                >
                  <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                    userType === 'student' ? 'bg-emerald-500/15' : 'bg-muted/70',
                  )}>
                    <GraduationCap className="text-emerald-600 dark:text-emerald-400" size={18} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-foreground">Freelancer</span>
                    <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-muted-foreground">
                      Get hired
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
                    'group relative flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-200 active:scale-[0.98]',
                    userType === 'business'
                      ? 'border-primary/55 bg-primary/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]'
                      : 'border-border/60 hover:border-primary/35 hover:bg-primary/[0.03]',
                  )}
                >
                  <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200',
                    userType === 'business' ? 'bg-primary/15' : 'bg-muted/70',
                  )}>
                    <Briefcase className="text-primary" size={18} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-foreground">Business</span>
                    <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-muted-foreground">
                      Hire talent
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
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4">
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
              <form onSubmit={handleMagicLink} className="space-y-2.5">
                <div className="flex items-center gap-2.5 rounded-2xl border border-input bg-background px-3.5 py-3 transition-colors focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
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
                    className="flex-1 bg-transparent text-base placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={magicLinkSending || !emailLooksValid}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border/70 bg-background py-3 text-[14px] font-semibold text-foreground transition-all duration-150 hover:bg-muted/50 hover:border-border active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {magicLinkSending ? (
                    <><Loader2 size={14} className="animate-spin" /> Sending link…</>
                  ) : (
                    <>{isLogin ? 'Email me a sign-in link' : 'Email me a sign-up link'}</>
                  )}
                </button>
                <p className="text-center text-[10.5px] text-muted-foreground/80">
                  No password. One-tap link works in any browser.
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
